import { NextResponse } from "next/server";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { renderUnitInspectionPdf } from "@/lib/document-pdf";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getKstDateTime } from "@/lib/agent-schedule";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { uploadUnitInspectionPdfCopies } from "@/lib/unit-inspection-pdf-storage";
import { reissueWithFixedWording } from "@/lib/unit-inspection-rules";
import { pgGetUnitInspection, pgGetUnitInspectionAiDiagnosis, pgSaveUnitInspectionPdfCorrection, sanitizeStoragePathSegment } from "@/lib/unit-inspections";

/**
 * 이미 pdf_url이 발급된 건은 DB 트리거(전기안전관리법 제24조 4년 보존 요건)가 원본 레코드
 * 수정을 막는다. 그래서 원본은 절대 건드리지 않고, 2026-08-24 문구 정리를 적용한 "수정본"
 * PDF만 새 파일로 렌더링해 반환한다 — DB에는 아무 것도 쓰지 않는다(원본 pdf_url 그대로).
 */
export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;

  try {
    const inspection = await pgGetUnitInspection(id);
    if (!inspection) {
      return NextResponse.json({ message: "점검 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!inspection.pdfUrl) {
      return NextResponse.json({ message: "아직 발급되지 않은 건입니다. 일반 PDF 발급을 사용해주세요." }, { status: 400 });
    }

    const apartment = await pgFindApartmentByIdentifier(inspection.apartmentId);
    if (!apartment) {
      return NextResponse.json({ message: "단지 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const fixed = reissueWithFixedWording(inspection.checklistItems, inspection.autoDiagnosis, inspection.companyAdvisories);

    const inspectedAtLabel = new Date(inspection.inspectedAt).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    // AI 안전진단(사후보정, after()로 백그라운드 생성)이 이미 완료된 건이면 그 내용을 반드시
    // 다시 실어야 한다 — 안 그러면 2페이지가 "AI 상세 진단이 아직 없어 요약만 안내합니다"
    // placeholder로 되돌아간다(2026-09-23 실제 신고: 글리프 깨짐 수정을 위해 재발급을 눌렀더니
    // 이미 생성돼 있던 AI 진단이 통째로 사라짐).
    const savedAiDiagnosis = await pgGetUnitInspectionAiDiagnosis(id);

    const pdfBytes = await renderUnitInspectionPdf({
      apartmentName: apartment.name,
      electricalSafetyManagerName: apartment.electricalSafetyManagerName,
      dong: inspection.dong,
      ho: inspection.ho,
      inspectedAtLabel,
      inspectionType: inspection.inspectionType,
      checklistItems: fixed.checklistItems,
      loadCurrent: inspection.loadCurrent,
      igr: inspection.igr,
      insulationResistance: inspection.insulationResistance,
      groundingResistance: inspection.groundingResistance,
      etcNotes: inspection.etcNotes,
      circuitBreakerCount: inspection.circuitBreakerCount,
      autoDiagnosis: fixed.autoDiagnosis,
      companyAdvisories: fixed.companyAdvisories,
      residentName: inspection.residentName,
      signatureData: inspection.signatureData,
      aiDiagnosis: savedAiDiagnosis
    });

    const { dateKey } = getKstDateTime();
    const corrected = await uploadUnitInspectionPdfCopies({
      objectPath: `unit-inspections/corrected/${dateKey}-${sanitizeStoragePathSegment(inspection.dong)}-${sanitizeStoragePathSegment(inspection.ho)}-${inspection.id}.pdf`,
      pdfBytes
    });

    // 원본 행(pdf_url 등)은 의도적으로 건드리지 않는다 — 별도 오버레이 테이블에만 포인터를 남긴다.
    await pgSaveUnitInspectionPdfCorrection(inspection.id, {
      correctedPdfUrl: corrected.pdfUrl,
      correctedPdfPrivatePath: corrected.pdfPrivatePath
    });

    return NextResponse.json({ correctedPdfUrl: corrected.pdfUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정본 PDF 생성에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

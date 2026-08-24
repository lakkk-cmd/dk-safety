import { NextResponse } from "next/server";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { renderUnitInspectionPdf } from "@/lib/document-pdf";
import { SUPABASE_DOCUMENTS_BUCKET } from "@/lib/document-generator";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getKstDateTime } from "@/lib/agent-schedule";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { uploadBinaryObject } from "@/lib/supabase-server";
import { reissueWithFixedWording } from "@/lib/unit-inspection-rules";
import { pgGetUnitInspection, pgSaveUnitInspectionPdfCorrection } from "@/lib/unit-inspections";

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
      etcNotes: inspection.etcNotes,
      autoDiagnosis: fixed.autoDiagnosis,
      companyAdvisories: fixed.companyAdvisories,
      residentName: inspection.residentName,
      signatureData: inspection.signatureData
    });

    const { dateKey } = getKstDateTime();
    const correctedPdfUrl = await uploadBinaryObject({
      bucket: SUPABASE_DOCUMENTS_BUCKET,
      objectPath: `unit-inspections/corrected/${dateKey}-${inspection.dong}-${inspection.ho}-${inspection.id}.pdf`,
      contentType: "application/pdf",
      data: pdfBytes
    });

    // 원본 행(pdf_url 등)은 의도적으로 건드리지 않는다 — 별도 오버레이 테이블에만 포인터를 남긴다.
    await pgSaveUnitInspectionPdfCorrection(inspection.id, correctedPdfUrl);

    return NextResponse.json({ correctedPdfUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수정본 PDF 생성에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

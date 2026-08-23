import { NextResponse } from "next/server";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { renderUnitInspectionPdf } from "@/lib/document-pdf";
import { SUPABASE_DOCUMENTS_BUCKET } from "@/lib/document-generator";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getKstDateTime } from "@/lib/agent-schedule";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { uploadBinaryObject } from "@/lib/supabase-server";
import { pgGetUnitInspection, pgSaveUnitInspectionPdf } from "@/lib/unit-inspections";

/** 이미 발급된(pdf_url 존재) 건은 재생성하지 않고 기존 URL을 그대로 반환한다 — DB 불변
 * 트리거가 재발급을 어차피 막아주지만, 여기서 한 번 더 걸러 불필요한 렌더링 비용을 아낀다. */
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
    if (inspection.pdfUrl) {
      return NextResponse.json({ pdfUrl: inspection.pdfUrl });
    }

    const apartment = await pgFindApartmentByIdentifier(inspection.apartmentId);
    if (!apartment) {
      return NextResponse.json({ message: "단지 정보를 찾을 수 없습니다." }, { status: 404 });
    }

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
      checklistItems: inspection.checklistItems,
      loadCurrent: inspection.loadCurrent,
      igr: inspection.igr,
      insulationResistance: inspection.insulationResistance,
      etcNotes: inspection.etcNotes,
      autoDiagnosis: inspection.autoDiagnosis,
      companyAdvisories: inspection.companyAdvisories,
      residentName: inspection.residentName,
      signatureData: inspection.signatureData
    });

    const { dateKey } = getKstDateTime();
    const pdfUrl = await uploadBinaryObject({
      bucket: SUPABASE_DOCUMENTS_BUCKET,
      objectPath: `unit-inspections/${dateKey}-${inspection.dong}-${inspection.ho}-${inspection.id}.pdf`,
      contentType: "application/pdf",
      data: pdfBytes
    });

    const saved = await pgSaveUnitInspectionPdf(inspection.id, pdfUrl);
    return NextResponse.json({ pdfUrl: saved.pdfUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 생성에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

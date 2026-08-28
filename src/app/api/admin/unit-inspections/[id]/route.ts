import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgGetApartment } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { deleteUnitInspectionPdfFiles } from "@/lib/unit-inspection-pdf-storage";
import { pgDeleteUnitInspection, pgGetUnitInspection, pgGetUnitInspectionPdfCorrectionRecord } from "@/lib/unit-inspections";

/**
 * 시연전용단지(demo, 116) 점검기록 전용 삭제 — 실고객 단지(contract/free_app)는 4년 법정보관
 * 불변성 트리거가 DELETE 자체를 거부하므로, 여기서는 명확한 403 메시지를 주려고 미리 확인만
 * 하고 실제 강제는 DB 트리거가 한다(방어적 이중화가 아니라, 이 라우트가 우회할 수 없는 구조).
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const apartment = await pgGetApartment(inspection.apartmentId);
    if (apartment?.partnershipType !== "demo") {
      return NextResponse.json({ message: "시연전용단지 소속 점검기록만 관리자 화면에서 삭제할 수 있습니다." }, { status: 403 });
    }

    const correction = await pgGetUnitInspectionPdfCorrectionRecord(id);
    await pgDeleteUnitInspection(id);
    await deleteUnitInspectionPdfFiles({ pdfUrl: inspection.pdfUrl, pdfPrivatePath: inspection.pdfPrivatePath, correction });

    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "삭제에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

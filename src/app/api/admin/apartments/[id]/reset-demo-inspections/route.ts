import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgGetApartment } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { deleteUnitInspectionPdfFiles } from "@/lib/unit-inspection-pdf-storage";
import {
  pgDeleteUnitInspection,
  pgListUnitInspectionPdfCorrectionRecords,
  pgListUnitInspectionsForApartment
} from "@/lib/unit-inspections";

/** 시연전용단지(demo, 116) 반복 시연으로 쌓인 점검기록을 한 번에 전부 지운다. 개별 삭제(`[id]` 라우트)와
 * 동일한 partnership_type 검증 + PDF 파일 정리를 단지 전체 건수만큼 반복한다. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const apartment = await pgGetApartment(id);
    if (apartment?.partnershipType !== "demo") {
      return NextResponse.json({ message: "시연전용단지만 전체 초기화할 수 있습니다." }, { status: 403 });
    }

    const [inspections, corrections] = await Promise.all([
      pgListUnitInspectionsForApartment(id),
      pgListUnitInspectionPdfCorrectionRecords()
    ]);

    for (const inspection of inspections) {
      await pgDeleteUnitInspection(inspection.id);
      await deleteUnitInspectionPdfFiles({
        pdfUrl: inspection.pdfUrl,
        pdfPrivatePath: inspection.pdfPrivatePath,
        correction: corrections[inspection.id] ?? null
      });
    }

    return NextResponse.json({ message: `${inspections.length}건 초기화했습니다.`, deletedCount: inspections.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "초기화에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

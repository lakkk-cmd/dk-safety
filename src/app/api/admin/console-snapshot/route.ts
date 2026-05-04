import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { pgReadReservations, pgListWorkers } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  try {
    const [apartments, orders, reservations, workers] = await Promise.all([
      pgListApartments(),
      pgListOrdersForAdmin(),
      pgReadReservations(),
      pgListWorkers()
    ]);
    return NextResponse.json({ apartments, orders, reservations, workers });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "스냅샷 조회 실패" }, { status: 500 });
  }
}

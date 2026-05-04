import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { appendActivityLog } from "@/lib/activity-log";
import { pgSetReservationPayment } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const body = (await request.json()) as { reservationId?: string; isPaid?: boolean };
  const reservationId = body.reservationId?.trim() ?? "";
  if (!reservationId || typeof body.isPaid !== "boolean") {
    return NextResponse.json({ message: "reservationId / isPaid 값이 필요합니다." }, { status: 400 });
  }
  try {
    const reservation = await pgSetReservationPayment(reservationId, body.isPaid);
    if (!reservation) {
      return NextResponse.json({ message: "예약을 찾을 수 없습니다." }, { status: 404 });
    }
    await appendActivityLog({
      action: "status_updated",
      reservationId: reservation.id,
      message: `${reservation.name} 예약 입금 상태가 ${reservation.isPaid ? "입금완료" : "미입금"}로 변경되었습니다.`
    });
    return NextResponse.json({ reservation });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "입금 상태 변경 실패" }, { status: 400 });
  }
}


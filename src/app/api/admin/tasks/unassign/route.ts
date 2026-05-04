import { NextResponse } from "next/server";
import { appendActivityLog } from "@/lib/activity-log";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgUnassignTask } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const body = (await request.json()) as { reservationId?: string };
  const reservationId = body.reservationId?.trim() ?? "";
  if (!reservationId) {
    return NextResponse.json({ message: "예약 ID가 필요합니다." }, { status: 400 });
  }
  try {
    const reservation = await pgUnassignTask(reservationId);
    if (!reservation) {
      return NextResponse.json({ message: "예약을 찾을 수 없습니다." }, { status: 404 });
    }
    await appendActivityLog({
      action: "task_unassigned",
      reservationId: reservation.id,
      message: `${reservation.name} 예약의 기사 배정이 해제되었습니다.`
    });
    return NextResponse.json({ reservation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "배정 해제에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

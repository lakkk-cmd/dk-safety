import { NextResponse } from "next/server";
import { appendActivityLog } from "@/lib/activity-log";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgAssignTask } from "@/lib/reservations-pg";
import { activateDispatch } from "@/lib/orders-pg";
import { pushLiveNotification, pushReservationProgressNotifications } from "@/lib/live-notify";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const body = (await request.json()) as { reservationId?: string; workerId?: string; orderId?: string };
  const reservationId = body.reservationId?.trim() ?? "";
  const workerId = body.workerId?.trim() ?? "";
  const orderId = body.orderId?.trim() ?? "";
  if (!reservationId || !workerId) {
    return NextResponse.json({ message: "예약 ID와 기사 ID가 필요합니다." }, { status: 400 });
  }
  try {
    // orders: 결제(PAID) 확인 후 dispatch_status를 READY(배정 대기)로 맞춥니다(015+ 제약).
    if (orderId) {
      await activateDispatch(orderId);
    }
    const reservation = await pgAssignTask(reservationId, workerId);
    await appendActivityLog({
      action: "task_assigned",
      reservationId: reservation.id,
      message: `${reservation.name} 예약이 기사에게 배정되었습니다.`
    });
    await pushReservationProgressNotifications({
      reservationId: reservation.id,
      customerName: reservation.name,
      customerPhone: reservation.phone,
      adminMessage: `${reservation.name} 예약이 기사 배정 중 상태로 변경되었습니다.`,
      residentMessage: `${reservation.name}님 예약이 기사 배정 중입니다. 잠시만 기다려주세요.`
    });
    await pushLiveNotification({
      role: "worker",
      targetWorkerId: workerId,
      reservationId: reservation.id,
      title: "새 작업 배정",
      message: `${reservation.name} 고객 작업이 배정되었습니다.`
    });
    return NextResponse.json({ reservation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "배정에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

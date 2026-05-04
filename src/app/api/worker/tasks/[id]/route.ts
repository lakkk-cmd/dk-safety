import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appendActivityLog } from "@/lib/activity-log";
import { notifyCustomerWorkCompleted } from "@/lib/customer-notification";
import { pushLiveNotification, pushReservationProgressNotifications } from "@/lib/live-notify";
import { pgCompleteTask, pgGetTaskForWorker, pgStartTask } from "@/lib/reservations-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const row = await pgGetTaskForWorker(id, session.workerId);
    if (!row) {
      return NextResponse.json({ message: "작업을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = (await request.json()) as { action?: string; signaturePng?: string; extraFee?: number };
  const action = body.action?.trim() ?? "";
  try {
    if (action === "start") {
      await pgStartTask(id, session.workerId);
      const row = await pgGetTaskForWorker(id, session.workerId);
      if (row) {
        await pushReservationProgressNotifications({
          reservationId: row.reservation.id,
          customerName: row.reservation.name,
          customerPhone: row.reservation.phone,
          adminMessage: `${row.reservation.name} 예약 작업이 현장 진행중으로 전환되었습니다.`,
          residentMessage: `${row.reservation.name}님 작업이 시작되었습니다.`
        });
      }
      return NextResponse.json({ message: "작업을 시작했습니다." });
    }
    if (action === "complete") {
      const signature = typeof body.signaturePng === "string" ? body.signaturePng.trim() : "";
      const extraFee =
        typeof body.extraFee === "number" && Number.isFinite(body.extraFee) ? Math.max(0, Math.round(body.extraFee)) : 0;
      await pgCompleteTask(id, session.workerId, signature, extraFee);
      const row = await pgGetTaskForWorker(id, session.workerId);
      if (row) {
        await appendActivityLog({
          action: "task_completed",
          reservationId: row.reservation.id,
          message: `${row.reservation.name} 현장 작업이 완료 처리되었습니다.`
        });
        try {
          const channels = await notifyCustomerWorkCompleted({
            id: row.reservation.id,
            name: row.reservation.name,
            phone: row.reservation.phone,
            apartmentName: row.reservation.apartmentName,
            serviceType: row.reservation.serviceType,
            preferredDate: row.reservation.preferredDate,
            preferredTime: row.reservation.preferredTime
          });
          await appendActivityLog({
            action: "task_completed",
            reservationId: row.reservation.id,
            message:
              channels.length > 0
                ? `${row.reservation.name} 고객에게 작업 완료 알림이 발송되었습니다. (${channels.join(", ")})`
                : `${row.reservation.name} 고객 알림 채널 설정이 없어 알림 발송은 생략되었습니다.`
          });
        } catch (notifyError) {
          const notifyMessage =
            notifyError instanceof Error ? notifyError.message : "작업 완료 알림 발송 중 알 수 없는 오류";
          await appendActivityLog({
            action: "task_completed",
            reservationId: row.reservation.id,
            message: `${row.reservation.name} 고객 작업 완료 알림 발송 실패: ${notifyMessage}`
          });
        }
        await pushReservationProgressNotifications({
          reservationId: row.reservation.id,
          customerName: row.reservation.name,
          customerPhone: row.reservation.phone,
          adminMessage: `${row.reservation.name} 예약 작업이 완료되었습니다.`,
          residentMessage:
            row.reservation.orderFinalPaymentStatus === "REQUESTED"
              ? `${row.reservation.name}님 작업이 완료되었습니다. 최종 정산을 결제하면 보증서가 즉시 발급됩니다.`
              : `${row.reservation.name}님 작업이 완료되었습니다. 보증서를 확인해주세요.`
        });
        await pushLiveNotification({
          role: "worker",
          targetWorkerId: session.workerId,
          reservationId: row.reservation.id,
          title: "작업 완료 처리",
          message: `${row.reservation.name} 고객 작업이 완료로 저장되었습니다.`
        });
      }
      return NextResponse.json({ message: "작업이 완료되었습니다.", task: row?.task, reservation: row?.reservation });
    }
    return NextResponse.json({ message: "유효하지 않은 요청입니다." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

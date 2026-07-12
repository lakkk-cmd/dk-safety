import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appendActivityLog } from "@/lib/activity-log";
import { notifyCustomerWorkCompleted } from "@/lib/customer-notification";
import { pushLiveNotification, pushReservationProgressNotifications } from "@/lib/live-notify";
import {
  pgAcceptTask,
  pgCompleteTask,
  pgDeclineTask,
  pgGetTaskForWorker,
  pgStartTask,
  pgUpgradeSimpleSwapTask
} from "@/lib/reservations-pg";
import { sendAdminAlertSms } from "@/lib/solapi-agent";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

/** 관리자(대표님) 개인 휴대폰으로 긴급 SMS 알림 발송 — 문자 팝업으로 바로 뜨도록 SMS 단일 경로 */
async function notifyAdminUrgent(message: string): Promise<void> {
  await sendAdminAlertSms(message);
}

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
  const body = (await request.json()) as {
    action?: string;
    signaturePng?: string;
    extraFee?: number;
    reason?: string;
    materials?: { id?: string; name?: string; qty?: number; unitPrice?: number }[];
    laborTier?: { label?: string; amount?: number } | null;
  };
  const action = body.action?.trim() ?? "";
  try {
    if (action === "accept") {
      await pgAcceptTask(id, session.workerId);
      return NextResponse.json({ message: "배정을 수락했습니다." });
    }
    if (action === "decline") {
      const reason = body.reason?.trim() ?? "";
      if (reason.length < 2) {
        return NextResponse.json({ message: "거절 사유를 2자 이상 입력해주세요." }, { status: 400 });
      }
      const { reservation, workerName } = await pgDeclineTask(id, session.workerId, reason);
      await appendActivityLog({
        action: "task_declined",
        reservationId: reservation.id,
        message: `${workerName} 기사가 ${reservation.name} 배정을 거절했습니다. (사유: ${reason})`
      });
      const urgentMessage = `⚠️[긴급 재배정] ${workerName} 기사가 배정을 거절했습니다\n예약: ${reservation.apartmentName ?? reservation.address}\n일시: ${reservation.preferredDate} ${reservation.preferredTime}\n사유: ${reason}\n→ 관리자 화면에서 즉시 다른 기사를 배정해주세요.`;
      await pushLiveNotification({
        role: "admin",
        reservationId: reservation.id,
        title: "⚠️ 긴급 재배정 필요",
        message: `${workerName} 기사가 ${reservation.name} 배정을 거절했습니다 (${reason})`
      });
      try {
        await notifyAdminUrgent(urgentMessage);
      } catch (notifyError) {
        const notifyMessage = notifyError instanceof Error ? notifyError.message : "알 수 없는 오류";
        await appendActivityLog({
          action: "task_declined",
          reservationId: reservation.id,
          message: `관리자 긴급 알림 발송 실패: ${notifyMessage}`
        });
      }
      return NextResponse.json({ message: "배정을 거절했습니다. 관리자에게 즉시 알림이 발송되었습니다." });
    }
    if (action === "upgrade") {
      const reason = body.reason?.trim() ?? "";
      if (reason.length < 2) {
        return NextResponse.json({ message: "업그레이드 사유를 2자 이상 입력해주세요." }, { status: 400 });
      }
      await pgUpgradeSimpleSwapTask(id, session.workerId, reason);
      return NextResponse.json({ message: "등급 업그레이드가 기록되었습니다." });
    }
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
      const materials = Array.isArray(body.materials)
        ? body.materials
            .filter((m): m is { id: string; name: string; qty: number; unitPrice: number } =>
              Boolean(m && m.id && m.name && Number.isFinite(m.qty) && Number.isFinite(m.unitPrice))
            )
            .map((m) => ({ id: m.id, name: m.name, qty: Math.max(1, Math.round(m.qty)), unitPrice: Math.max(0, Math.round(m.unitPrice)) }))
        : undefined;
      const laborTierAmount = Number(body.laborTier?.amount);
      const laborTier =
        body.laborTier && body.laborTier.label && Number.isFinite(laborTierAmount)
          ? { label: body.laborTier.label, amount: Math.max(0, Math.round(laborTierAmount)) }
          : null;
      await pgCompleteTask(id, session.workerId, signature, extraFee, { materials, laborTier });
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

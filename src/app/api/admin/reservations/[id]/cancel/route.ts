import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { appendActivityLog } from "@/lib/activity-log";
import { pushReservationProgressNotifications } from "@/lib/live-notify";
import { pgCancelReservationAndRefund } from "@/lib/refund";
import { pgFindReservationById } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

/** 관리자 전용 예약 취소 + Toss 자동환불. `/admin/reservations`에서만 호출한다. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "취소·환불은 Supabase DB 모드에서만 지원됩니다." }, { status: 400 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { reason?: string; forceRefund?: boolean } | null;
  const reason = body?.reason?.trim() ?? "";
  if (!reason) {
    return NextResponse.json({ message: "취소 사유를 입력해주세요." }, { status: 400 });
  }

  try {
    const before = await pgFindReservationById(id);
    if (!before) {
      return NextResponse.json({ message: "대상을 찾을 수 없습니다." }, { status: 404 });
    }

    const result = await pgCancelReservationAndRefund(id, {
      reason,
      actor: "ADMIN",
      forceRefund: body?.forceRefund === true
    });

    const refundSummary = result.refunded
      ? `${result.refundAmount.toLocaleString()}원 자동환불`
      : result.manualBankRefundNeeded
        ? `수동 환불 필요 (약 ${result.manualRefundAmount.toLocaleString()}원 — 자동환불 시스템으로 추적 안 되는 결제건)`
        : "환불 없음";
    await appendActivityLog({
      action: "status_updated",
      reservationId: id,
      message: `${before.name} 고객 예약이 취소 처리되었습니다 (${refundSummary}, 사유: ${reason})`
    });

    await pushReservationProgressNotifications({
      reservationId: id,
      customerName: before.name,
      customerPhone: before.phone,
      adminMessage: result.manualBankRefundNeeded
        ? `${before.name} 예약이 취소 처리되었습니다. ⚠️ 자동환불이 안 되는 결제건입니다 — 약 ${result.manualRefundAmount.toLocaleString()}원을 직접 계좌로 환불해주세요.`
        : `${before.name} 예약이 취소 처리되었습니다.`,
      residentMessage: result.refunded
        ? `${before.name}님, 예약이 취소되었고 선결제하신 ${result.refundAmount.toLocaleString()}원이 환불 처리됩니다.`
        : result.manualBankRefundNeeded
          ? `${before.name}님, 예약이 취소되었습니다. 입금하신 금액은 확인 후 별도로 환불해드리겠습니다.`
          : `${before.name}님, 예약이 취소되었습니다. (${result.policyReason})`
    });

    return NextResponse.json({ message: "취소 처리가 완료되었습니다.", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "취소 처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

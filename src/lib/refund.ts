/** 예약 취소 + Toss 자동환불 — 1단계: 관리자 전용(`/admin/reservations`).
 *  환불정책(표준형): 방문 1일 전까지 취소=선결제 기본요금 전액환불, 당일취소·노쇼=환불 불가.
 *  현장 방문 후(점검 결과 문제없음 포함) 취소는 관리자가 forceRefund로 명시해야만 처리된다. */

import { pgFindOrderByReservationId } from "@/lib/orders-pg";
import { pgFindReservationById } from "@/lib/reservations-pg";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import { authHeader } from "@/lib/toss-agent";

export type CancelPolicyResult = { fullRefundEligible: boolean; reason: string };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function todayKstDateString(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** preferredDate는 'YYYY-MM-DD' 문자열(reservations.preferred_date) — 방문 예정일이 오늘보다
 *  뒤(내일부터)면 전액환불 대상, 오늘이거나 이미 지났으면 정책상 환불 불가. */
export function evaluateCancelPolicy(preferredDate: string): CancelPolicyResult {
  const today = todayKstDateString();
  if (preferredDate > today) {
    return { fullRefundEligible: true, reason: "방문 1일 전 취소 — 전액환불 대상" };
  }
  return { fullRefundEligible: false, reason: "방문 당일 취소 또는 노쇼 — 환불 불가(정책상)" };
}

export type CancelTossResult = { ok: true; raw: Record<string, unknown> } | { ok: false; message: string };

/**
 * Toss 결제취소: POST /v1/payments/{paymentKey}/cancel, body {cancelReason, cancelAmount}.
 * 이 코드베이스의 기존 /confirm 패턴(src/app/api/payments/toss/confirm/route.ts)과 동일한
 * HTTP Basic 인증을 재사용했다. 실제 프로덕션 키로 첫 호출 전에 Toss 콘솔/공식 문서로
 * 요청 바디 필드명을 한 번 더 확인할 것 — WebFetch로 최신 문서 재검증을 시도했으나 세션
 * 한도로 실패했다(2026-07-11).
 */
export async function cancelTossPayment(
  paymentKey: string,
  amount: number,
  cancelReason: string,
): Promise<CancelTossResult> {
  const res = await fetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ cancelReason, cancelAmount: amount }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, message: (data.message as string) ?? `Toss 결제취소 실패 (${res.status})` };
  }
  return { ok: true, raw: data };
}

export type CancelReservationResult = {
  refunded: boolean;
  refundAmount: number;
  policyReason: string;
  /** true면 정책상 환불 대상인데 Toss로 자동환불할 수 없어(가상계좌 결제 또는 orders에
   *  추적되지 않는 수동확인 결제) 관리자가 직접 계좌로 환불해야 한다는 뜻. */
  manualBankRefundNeeded: boolean;
  /** 수동환불 필요 시 안내용 예상 금액(원) — 자동환불 성공 시엔 refundAmount와 동일하지
   *  않을 수 있음(자동환불은 refundAmount, 수동환불 안내는 이 필드). */
  manualRefundAmount: number;
};

// dispatch_status 중 이미 현장 방문이 진행/완료된 상태 — 강제 옵션 없이는 취소 차단.
const VISITED_DISPATCH_STATUSES = new Set(["IN_PROGRESS", "DONE"]);

/** 예약 취소 + (필요 시) Toss 자동환불 처리. 관리자 라우트에서만 호출한다. */
export async function pgCancelReservationAndRefund(
  reservationId: string,
  params: { reason: string; actor: string; forceRefund?: boolean },
): Promise<CancelReservationResult> {
  const supabase = requireSupabaseAdmin();

  const reservation = await pgFindReservationById(reservationId);
  if (!reservation) throw new Error("예약을 찾을 수 없습니다.");
  if (reservation.status === "취소") throw new Error("이미 취소된 예약입니다.");
  if (reservation.status === "완료") throw new Error("이미 완료된 예약은 취소할 수 없습니다.");

  const order = await pgFindOrderByReservationId(reservationId);
  const dispatchStatus = order?.dispatch_status ?? "";
  if (VISITED_DISPATCH_STATUSES.has(dispatchStatus) && !params.forceRefund) {
    throw new Error(
      "이미 현장 방문이 진행/완료된 예약입니다. 그래도 취소·환불하려면 강제 취소 옵션으로 다시 요청하세요.",
    );
  }

  const policy = evaluateCancelPolicy(reservation.preferredDate);
  const eligibleForRefund = policy.fullRefundEligible || params.forceRefund === true;

  // 가상계좌(무통장입금) 결제는 Toss 취소 API에 refundReceiveAccount(환불받을 계좌)가
  // 조건부 필수인데, 이 프로젝트는 아직 고객 환불계좌를 입력받는 흐름이 없다 — 카드결제와
  // 똑같이 자동 취소를 시도하면 Toss가 거부하거나(최악의 경우) 잘못된 계좌로 나갈 위험이
  // 있으므로, 이 결제수단은 자동환불을 건너뛰고 관리자가 수동으로 계좌환불하도록 안내한다.
  const isBankTransfer = order?.pg_provider === "BANK_TRANSFER";

  // 실제 프로덕션 데이터 확인(2026-07-11) 결과, 관리자가 orders/Toss 흐름을 거치지 않고
  // "입금완료로 변경" 버튼으로 reservations.is_paid만 직접 켠 결제 건이 있었다(prepayment_tx_id가
  // "MANUAL-"로 시작). 이런 건은 orders.payment_status가 'PAID'가 아니라서 아래 자동환불
  // 분기를 안 타는데, 그렇다고 조용히 "환불 없음"으로 끝내면 실제로 돈을 받은 고객인데도
  // 관리자가 "자동으로 처리됐다"고 착각할 위험이 있다 — 반드시 수동환불 필요로 표시한다.
  const isUntrackedManualPayment = reservation.isPaid && (!order || order.payment_status !== "PAID");

  let refundAmount = 0;
  let refunded = false;
  let manualBankRefundNeeded = false;
  let manualRefundAmount = 0;

  if (order && order.payment_status === "PAID" && eligibleForRefund) {
    const amount = Number(order.base_fee ?? 0);
    if (amount > 0 && isBankTransfer) {
      manualBankRefundNeeded = true;
      manualRefundAmount = amount;
    } else if (amount > 0 && order.payment_key) {
      const result = await cancelTossPayment(order.payment_key, amount, params.reason);
      if (!result.ok) {
        throw new Error(`Toss 결제취소 실패: ${result.message}`);
      }
      refundAmount = amount;
      refunded = true;
    }
  } else if (isUntrackedManualPayment && eligibleForRefund) {
    manualBankRefundNeeded = true;
    manualRefundAmount = Number(order?.base_fee ?? reservation.baseFee ?? 0);
  }

  const nowIso = new Date().toISOString();

  if (order) {
    const { error: orderErr } = await supabase
      .from("orders")
      .update({
        payment_status: "CANCELLED",
        dispatch_status: "CANCELLED",
        cancelled_at: nowIso,
        cancel_reason: params.reason,
        refund_amount: refundAmount,
        // 수동환불 필요 금액을 여기서도 기록해둬야, 취소 순간의 토스트 메시지를 놓쳐도
        // 나중에 금융/가상계좌 관리 화면에서 "아직 환불 안 보낸 건" 목록으로 추적할 수 있다
        // (2026-07-23 발견 — 예전엔 이 순간 안내만 하고 어디에도 남기지 않았다).
        manual_refund_amount: manualBankRefundNeeded ? manualRefundAmount : null,
        updated_at: nowIso,
      })
      .eq("id", order.id);
    if (orderErr) throw new Error(`주문 취소 반영 실패: ${orderErr.message}`);
  }

  const { error: reservationErr } = await supabase
    .from("reservations")
    .update({ status: "취소", cancelled_at: nowIso, cancel_reason: params.reason })
    .eq("id", reservationId);
  if (reservationErr) throw new Error(`예약 취소 반영 실패: ${reservationErr.message}`);

  await supabase.from("order_logs").insert({
    reservation_id: reservationId,
    status_from: reservation.status,
    status_to: "CANCELLED",
    actor: params.actor,
    note: `CANCEL:${JSON.stringify({
      reason: params.reason,
      refunded,
      refundAmount,
      manualBankRefundNeeded,
      manualRefundAmount,
      untrackedManualPayment: isUntrackedManualPayment,
      forceRefund: Boolean(params.forceRefund),
      policyReason: policy.reason,
    })}`,
  });

  return { refunded, refundAmount, policyReason: policy.reason, manualBankRefundNeeded, manualRefundAmount };
}

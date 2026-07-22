import { NextResponse } from "next/server";
import { normalizePrepaymentAmount, pgFindOrderById, pgMarkPaidAndActivate } from "@/lib/orders-pg";
import { pgSetReservationPayment } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const eventType =
    (typeof body.eventType === "string" && body.eventType.trim()) ||
    (typeof body.event_type === "string" && body.event_type.trim()) ||
    (typeof body.type === "string" && body.type.trim()) ||
    (typeof (body.data as Record<string, unknown> | undefined)?.eventType === "string" &&
      ((body.data as Record<string, unknown>).eventType as string).trim()) ||
    "";
  const normalizedEventType = eventType.toUpperCase();
  const allowedEventTypes = new Set(["PAYMENT_STATUS_CHANGED", "ORDER_PAYMENT_STATUS_CHANGED", "DEPOSIT_CALLBACK", ""]);
  if (!allowedEventTypes.has(normalizedEventType)) {
    return NextResponse.json({ ok: true, message: `처리 제외 이벤트: ${eventType || "unknown"}` });
  }

  const data = (body.data as Record<string, unknown> | undefined) ?? {};
  const paymentObj = (body.payment as Record<string, unknown> | undefined) ?? {};
  const metadata = (body.metadata as Record<string, unknown> | undefined) ?? {};

  // Toss/Portone/입금 콜백 공통 필드 최대한 흡수
  const rawOrderId =
    (typeof body.orderId === "string" && body.orderId) ||
    (typeof body.merchant_uid === "string" && body.merchant_uid) ||
    (typeof data.orderId === "string" && data.orderId) ||
    (typeof data.merchant_uid === "string" && data.merchant_uid) ||
    (typeof paymentObj.orderId === "string" && paymentObj.orderId) ||
    (typeof metadata.orderId === "string" && metadata.orderId) ||
    "";
  const orderId = rawOrderId.trim();

  const statusUpper = (
    (typeof body.status === "string" && body.status) ||
    (typeof data.status === "string" && data.status) ||
    (typeof paymentObj.status === "string" && paymentObj.status) ||
    ""
  )
    .trim()
    .toUpperCase();
  const statusLower = statusUpper.toLowerCase();

  const paymentKey =
    ((typeof body.paymentKey === "string" && body.paymentKey) ||
      (typeof data.paymentKey === "string" && data.paymentKey) ||
      (typeof paymentObj.paymentKey === "string" && paymentObj.paymentKey) ||
      "")
      .trim() || "";
  const impUid =
    ((typeof body.imp_uid === "string" && body.imp_uid) || (typeof data.imp_uid === "string" && data.imp_uid) || "")
      .trim() || "";
  const amountRaw =
    (typeof body.amount === "number" && body.amount) ||
    (typeof data.amount === "number" && data.amount) ||
    (typeof paymentObj.totalAmount === "number" && paymentObj.totalAmount) ||
    (typeof paymentObj.amount === "number" && paymentObj.amount) ||
    0;
  const paidAmount = Math.max(0, Math.round(Number(amountRaw)));

  const providerHint = (
    (typeof body.provider === "string" && body.provider) ||
    (typeof data.provider === "string" && data.provider) ||
    (typeof paymentObj.provider === "string" && paymentObj.provider) ||
    ""
  )
    .trim()
    .toUpperCase();

  try {
    const depositPaidStatus = new Set(["DONE", "PAID", "DEPOSITED", "DEPOSIT_COMPLETED", "COMPLETED"]);
    const isPaidSignal = depositPaidStatus.has(statusUpper);
    const isDepositEvent =
      normalizedEventType === "DEPOSIT_CALLBACK" ||
      normalizedEventType === "PAYMENT_STATUS_CHANGED" ||
      normalizedEventType === "ORDER_PAYMENT_STATUS_CHANGED" ||
      normalizedEventType === "";
    const isTossLike = providerHint === "TOSS" || paymentKey.length > 0 || statusUpper === "DONE";
    const isPortoneLike = providerHint === "PORTONE" || impUid.length > 0 || statusLower === "paid";

    if (orderId && isDepositEvent && isPaidSignal && isTossLike) {
      const existing = await pgFindOrderById(orderId);
      if (!existing) {
        return NextResponse.json({ message: "주문을 찾지 못했습니다." }, { status: 404 });
      }
      const expected = normalizePrepaymentAmount(existing.base_fee);
      if (paidAmount > 0 && paidAmount !== expected) {
        // 금액 불일치 시 4xx 반환 금지 — PG사가 무한 재시도함
        return NextResponse.json(
          { ok: false, message: `입금 금액 불일치: expected=${expected}, received=${paidAmount}` }
        );
      }
      const order = await pgMarkPaidAndActivate({
        orderId,
        provider: "TOSS",
        paymentKey: paymentKey || undefined
      });
      if (order.reservation_id) {
        await pgSetReservationPayment(order.reservation_id, true, {
          prepaymentTxId: paymentKey || `TOSS-${Date.now()}`,
          paidAmount: paidAmount > 0 ? paidAmount : expected
        });
      }
      return NextResponse.json({ ok: true, mode: "AUTO_DEPOSIT_CONFIRM", order });
    }

    if (orderId && isDepositEvent && isPaidSignal && isPortoneLike) {
      const existing = await pgFindOrderById(orderId);
      if (!existing) {
        return NextResponse.json({ message: "주문을 찾지 못했습니다." }, { status: 404 });
      }
      const expected = normalizePrepaymentAmount(existing.base_fee);
      if (paidAmount > 0 && paidAmount !== expected) {
        // 금액 불일치 시 4xx 반환 금지 — PG사가 무한 재시도함
        return NextResponse.json(
          { ok: false, message: `입금 금액 불일치: expected=${expected}, received=${paidAmount}` }
        );
      }
      const order = await pgMarkPaidAndActivate({
        orderId,
        provider: "PORTONE",
        impUid: impUid || undefined
      });
      if (order.reservation_id) {
        await pgSetReservationPayment(order.reservation_id, true, {
          prepaymentTxId: impUid || `PORTONE-${Date.now()}`,
          paidAmount: paidAmount > 0 ? paidAmount : expected
        });
      }
      return NextResponse.json({ ok: true, mode: "AUTO_DEPOSIT_CONFIRM", order });
    }
    return NextResponse.json({ ok: true, message: "처리 대상 이벤트가 아닙니다." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Webhook 처리 실패" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgFindOrderByReservationId, pgMarkPaidAndActivate } from "@/lib/orders-pg";
import { pgSetReservationPayment } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  let body: { reservationId?: string } = {};
  try {
    body = (await request.json()) as { reservationId?: string };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const reservationId = body.reservationId?.trim() ?? "";
  if (!reservationId) {
    return NextResponse.json({ message: "reservationId가 필요합니다." }, { status: 400 });
  }

  try {
    const order = await pgFindOrderByReservationId(reservationId);
    if (!order) {
      return NextResponse.json({ message: "연결된 주문(order)을 찾지 못했습니다." }, { status: 404 });
    }
    if (order.payment_status !== "WAITING_FOR_DEPOSIT" && order.payment_status !== "PENDING") {
      return NextResponse.json({ message: `현재 주문 상태에서는 입금확인할 수 없습니다. (${order.payment_status})` }, { status: 400 });
    }

    const activated = await pgMarkPaidAndActivate({
      orderId: order.id,
      provider: "BANK_TRANSFER",
      paymentKey: order.payment_key ?? undefined,
      impUid: order.imp_uid ?? undefined
    });

    // paidAmount를 명시하지 않으면 pgSetReservationPayment가 예약(reservations.base_fee, 요금의
    // 단일 출처)을 그대로 써서 activate_assignment 검증(paid_amount>=base_fee)이 항상 통과한다.
    // orders.base_fee는 요금 변경 전에 생성된 오래된 주문에서 값이 갱신되지 않고 남아있을 수 있어
    // 이를 기준으로 삼으면(과거엔 50k/100k로 하드코딩까지 되어 있었다) 실제 예약금보다 낮게 잡혀
    // "결제 금액이 기본 출장비에 미달합니다" 오류로 관리자의 계좌입금 확인 자체가 막힌다.
    const reservation = await pgSetReservationPayment(reservationId, true, {
      prepaymentTxId: `BANK-${Date.now()}`
    });
    if (!reservation) {
      return NextResponse.json({ message: "예약을 찾지 못했습니다." }, { status: 404 });
    }

    return NextResponse.json({
      message: "입금확인이 완료되어 결제 상태가 PAID로 반영되고 기사 배정 가능 상태가 되었습니다.",
      order: activated,
      reservation
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "입금확인 처리 실패" }, { status: 500 });
  }
}

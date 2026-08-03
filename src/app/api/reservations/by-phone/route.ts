import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/reservation-validation";
import { pgFindReservationsByPhone } from "@/lib/reservations-pg";
import { pgFindFieldReportByReservationId } from "@/lib/field-reports";
import { computeAdditionalDueAmount, pgFindOrderByReservationId } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const phoneRaw = new URL(request.url).searchParams.get("phone")?.trim() ?? "";
  if (!/^01[0-9]-?\d{3,4}-?\d{4}$/.test(phoneRaw)) {
    return NextResponse.json({ message: "연락처 형식이 올바르지 않습니다." }, { status: 400 });
  }
  try {
    const phone = normalizePhone(phoneRaw);
    const reservations = await pgFindReservationsByPhone(phone);
    const items = await Promise.all(
      reservations.map(async (reservation) => {
        const order = await pgFindOrderByReservationId(reservation.id);
        return {
          reservation,
          fieldReport: await pgFindFieldReportByReservationId(reservation.id),
          // 최종정산 카드결제 버튼용 — payment_key/imp_uid 등 민감 필드는 넘기지 않는다.
          // finalPaymentStatus는 reservations.orderFinalPaymentStatus(별도 조인) 대신 이 order 자체
          // 값을 그대로 써야 한다 — 한 예약에 order가 2건 이상 걸리는 예외 상황에서 두 조인이
          // 서로 다른 행을 가리켜 버튼 표시가 실제 최신 정산 상태와 어긋날 수 있기 때문.
          order: order
            ? {
                id: order.id,
                additionalDueAmount: computeAdditionalDueAmount(order),
                finalPaymentStatus: order.final_payment_status as string | null
              }
            : null
        };
      })
    );
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

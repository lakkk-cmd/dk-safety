import { NextResponse } from "next/server";
import { pgMarkFinalPaymentPaidAndIssueWarranty, pgRequestFinalSettlement } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function PATCH(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const order = await pgRequestFinalSettlement(id);
    return NextResponse.json({
      message: "최종 정산 요청이 생성되었습니다.",
      order
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "최종 정산 요청 실패" }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { provider?: "TOSS" | "PORTONE" | "MANUAL"; paymentKey?: string; impUid?: string };
  try {
    const result = await pgMarkFinalPaymentPaidAndIssueWarranty({
      orderId: id,
      provider: body.provider ?? "MANUAL",
      paymentKey: body.paymentKey,
      impUid: body.impUid
    });
    return NextResponse.json({
      message: "최종 결제가 완료되어 디지털 보증서가 발급되었습니다.",
      result
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "최종 결제 처리 실패" }, { status: 400 });
  }
}

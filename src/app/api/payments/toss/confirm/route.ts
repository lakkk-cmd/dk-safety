import { NextResponse } from "next/server";
import { pgSaveCardPaymentRef } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const secretKey = process.env.TOSS_SECRET_KEY?.trim() ?? "";
  if (!secretKey) {
    return NextResponse.json({ message: "TOSS_SECRET_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  let body: { paymentKey?: string; orderId?: string; amount?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const paymentKey = body.paymentKey?.trim() ?? "";
  const orderId = body.orderId?.trim() ?? "";
  const amount = Number(body.amount ?? 0);
  if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "paymentKey/orderId/amount가 필요합니다." }, { status: 400 });
  }

  const basic = Buffer.from(`${secretKey}:`).toString("base64");
  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    return NextResponse.json({ message: (data.message as string) ?? "Toss 결제 승인 실패", data }, { status: 400 });
  }

  await pgSaveCardPaymentRef({
    orderId,
    provider: "TOSS",
    paymentKey
  });

  return NextResponse.json({
    message: "결제 승인이 완료되었습니다. Webhook 상태 동기화를 기다립니다.",
    data
  });
}

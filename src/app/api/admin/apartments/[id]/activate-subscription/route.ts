/**
 * 계좌이체 입금 수동확인 → 구독 활성화(114). 세금계산서는 앱 밖에서 대표님이 기존 방식대로
 * 발행하며, 이 라우트는 "입금 확인했으니 30일 열어준다"까지만 한다.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgActivateSubscriptionManual } from "@/lib/apartment-subscriptions-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;

  try {
    const subscription = await pgActivateSubscriptionManual(id);
    return NextResponse.json({
      message: "구독을 활성화했습니다.",
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "활성화에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

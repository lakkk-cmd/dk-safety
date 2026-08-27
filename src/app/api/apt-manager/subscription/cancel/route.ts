import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgCancelSubscription } from "@/lib/apartment-subscriptions-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

/** 해지해도 current_period_end까지는 계속 활성 — 즉시 차단·환불은 하지 않는다(크론이 만료 처리). */
export async function POST() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const managerId = await getApartmentManagerIdFromCookies();
  const manager = managerId ? await pgGetApartmentManager(managerId) : null;
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const subscription = await pgCancelSubscription(manager.apartmentId);
    return NextResponse.json({
      message: "해지 예약되었습니다. 남은 기간까지는 그대로 이용하실 수 있어요.",
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "해지 처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

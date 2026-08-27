import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import {
  FREE_PDF_QUOTA_PER_CYCLE,
  getSubscriptionTierPrice,
  pgEnsureApartmentSubscription,
  pgGetPdfQuotaStatus,
  pgIssueTossCustomerKey
} from "@/lib/apartment-subscriptions-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

async function requireScopedManager() {
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) return null;
  const manager = await pgGetApartmentManager(managerId);
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) return null;
  return { managerId: manager.id, apartmentId: manager.apartmentId };
}

export async function GET() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const scope = await requireScopedManager();
  if (!scope) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const [subscription, quota, apartment] = await Promise.all([
      pgEnsureApartmentSubscription(scope.apartmentId),
      pgGetPdfQuotaStatus(scope.apartmentId),
      pgFindApartmentByIdentifier(scope.apartmentId)
    ]);

    return NextResponse.json({
      subscription: {
        status: subscription.status,
        billingMethod: subscription.billingMethod,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingAt: subscription.nextBillingAt,
        lastPaymentAt: subscription.lastPaymentAt,
        cancelledAt: subscription.cancelledAt
      },
      quota: { ...quota, freeQuotaPerCycle: FREE_PDF_QUOTA_PER_CYCLE },
      apartment: {
        name: apartment?.name ?? "",
        totalUnits: apartment?.totalUnits ?? null,
        monthlyPrice: getSubscriptionTierPrice(apartment?.totalUnits ?? null)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "구독 정보 조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

/**
 * 카드 등록창을 띄우기 직전에 customerKey를 발급받는다. 클라이언트가 만든 값을 그대로 쓰면
 * 콜백에서 "이 customerKey가 정말 이 단지 것인지"를 검증할 근거가 없으므로, 서버가 무작위로
 * 만들어 구독행에 먼저 저장해 두고 콜백에서 대조한다(Toss 문서 권고).
 */
export async function POST() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const scope = await requireScopedManager();
  if (!scope) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const customerKey = await pgIssueTossCustomerKey(scope.apartmentId);
    return NextResponse.json({ customerKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "카드 등록 준비에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

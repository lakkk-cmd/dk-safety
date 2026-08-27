/**
 * 세대전기점검 앱 단지 구독료 자동청구(114). 매일 돌면서 next_billing_at이 지난 toss_auto 구독을
 * 청구한다. 가격은 스냅샷하지 않고 매번 apartments.total_units로 다시 계산한다 — 단지 세대수가
 * 바뀌면 다음 청구부터 자동으로 반영된다.
 */
import { NextResponse } from "next/server";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { pgListApartmentManagers } from "@/lib/apartment-managers-pg";
import {
  getSubscriptionTierPrice,
  pgExpireEndedCancellations,
  pgListSubscriptionsDueForCharge,
  pgRecordAutoChargeResult
} from "@/lib/apartment-subscriptions-pg";
import { sendSMS } from "@/lib/solapi-agent";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { chargeBillingKey } from "@/lib/toss-billing";

export const maxDuration = 300;

async function notifyManagers(apartmentId: string, text: string): Promise<void> {
  const managers = await pgListApartmentManagers("approved");
  const targets = managers.filter((m) => m.apartmentId === apartmentId);
  for (const manager of targets) {
    try {
      await sendSMS(manager.phone, text);
    } catch (error) {
      console.error(`[cron/apartment-subscription-billing] SMS 발송 실패(${manager.phone}):`, error);
    }
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ success: false, error: "Supabase DB 모드가 아닙니다." }, { status: 500 });
  }

  try {
    const expired = await pgExpireEndedCancellations();
    const due = await pgListSubscriptionsDueForCharge();

    let charged = 0;
    let failed = 0;

    for (const subscription of due) {
      if (!subscription.tossBillingKey || !subscription.tossCustomerKey) {
        await pgRecordAutoChargeResult(subscription.apartmentId, { success: false, failReason: "빌링키 없음" });
        failed += 1;
        continue;
      }

      const apartment = await pgFindApartmentByIdentifier(subscription.apartmentId).catch(() => null);
      const amount = getSubscriptionTierPrice(apartment?.totalUnits ?? null);
      const apartmentName = apartment?.name ?? "단지";

      try {
        await chargeBillingKey({
          billingKey: subscription.tossBillingKey,
          customerKey: subscription.tossCustomerKey,
          amount,
          orderId: crypto.randomUUID(),
          orderName: `세대전기점검 앱 구독료 (${apartmentName})`
        });
        await pgRecordAutoChargeResult(subscription.apartmentId, { success: true });
        charged += 1;
        await notifyManagers(
          subscription.apartmentId,
          `[대경이엔피] 세대전기점검 앱 구독료 ${amount.toLocaleString("ko-KR")}원이 등록하신 카드로 결제되었습니다. 앞으로 30일간 점검표 PDF를 제한 없이 받으실 수 있어요.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "결제 실패";
        await pgRecordAutoChargeResult(subscription.apartmentId, { success: false, failReason: message });
        failed += 1;
        await notifyManagers(
          subscription.apartmentId,
          `[대경이엔피] 세대전기점검 앱 구독료 결제에 실패했습니다. 카드 정보를 다시 등록해주세요. 점검 입력과 세대 알림 발송은 계속 무료로 이용하실 수 있어요. inspect.dkansim.com`
        );
        console.error(`[cron/apartment-subscription-billing] ${subscription.apartmentId} 청구 실패:`, error);
      }
    }

    return NextResponse.json({ success: true, due: due.length, charged, failed, expired });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

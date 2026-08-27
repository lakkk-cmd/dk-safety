/**
 * Toss 카드 등록창(requestBillingAuth)의 successUrl 리다이렉트 착지점.
 * `?customerKey=..&authKey=..`를 받아 빌링키를 발급·저장하고 구독을 활성화한 뒤 구독관리 화면으로
 * 되돌려 보낸다. 브라우저 최상위 네비게이션이라 SameSite=Lax인 전기과장 세션 쿠키가 함께 온다.
 */
import { NextResponse } from "next/server";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { pgGetApartmentSubscription, pgSaveTossBillingKey } from "@/lib/apartment-subscriptions-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { issueBillingKey } from "@/lib/toss-billing";

function redirectToSubscribe(request: Request, params: Record<string, string>): NextResponse {
  // inspect.dkansim.com에서는 미들웨어가 /apt-manager를 덧붙이므로 여기서는 접두사 없는 경로를
  // 쓰면 안 되고, 반대로 접두사를 두 번 붙여서도 안 된다 — 요청이 온 호스트를 그대로 유지한 채
  // 절대경로를 만들고, 미들웨어의 멱등 처리(hostRewritePath)에 맡긴다.
  const url = new URL("/apt-manager/subscribe", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return redirectToSubscribe(request, { billing: "error", reason: "db" });
  }

  const managerId = await getApartmentManagerIdFromCookies();
  const manager = managerId ? await pgGetApartmentManager(managerId) : null;
  if (!manager || manager.approvalStatus !== "approved" || !manager.apartmentId) {
    return NextResponse.redirect(new URL("/apt-manager/login", request.url));
  }

  const query = new URL(request.url).searchParams;
  const authKey = query.get("authKey")?.trim() ?? "";
  const customerKey = query.get("customerKey")?.trim() ?? "";
  if (!authKey || !customerKey) {
    return redirectToSubscribe(request, { billing: "error", reason: "missing_key" });
  }

  try {
    const subscription = await pgGetApartmentSubscription(manager.apartmentId);
    // 카드 등록창을 띄우기 전에 서버가 발급해 저장해 둔 값과 일치해야만 진행한다.
    if (!subscription?.tossCustomerKey || subscription.tossCustomerKey !== customerKey) {
      return redirectToSubscribe(request, { billing: "error", reason: "customer_key_mismatch" });
    }

    const issued = await issueBillingKey({ authKey, customerKey });
    await pgSaveTossBillingKey(manager.apartmentId, {
      customerKey: issued.customerKey,
      billingKey: issued.billingKey
    });
    return redirectToSubscribe(request, { billing: "success" });
  } catch (error) {
    console.error("[apt-manager/subscription/billing-auth-callback] 빌링키 발급 실패:", error);
    return redirectToSubscribe(request, { billing: "error", reason: "issue_failed" });
  }
}

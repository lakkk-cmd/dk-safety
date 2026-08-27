/**
 * Toss 자동결제(빌링) — 세대전기점검 앱 단지 구독료 청구용.
 * 흐름: 클라이언트가 requestBillingAuth("카드")로 카드 등록 → successUrl로 authKey/customerKey 수신
 *      → issueBillingKey()로 빌링키 발급·저장 → 이후 크론이 chargeBillingKey()로 주기 청구.
 * 인증 방식(시크릿키 Basic)은 기존 결제와 동일하므로 toss-agent의 authHeader()를 그대로 재사용한다.
 */
import { authHeader } from "@/lib/toss-agent";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

export type TossBillingKey = {
  billingKey: string;
  customerKey: string;
  cardCompany: string | null;
  cardNumber: string | null;
  authenticatedAt: string | null;
};

export type TossBillingCharge = {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string | null;
};

async function readTossError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  return `${res.status} ${body.code ?? ""} ${body.message ?? ""}`.trim();
}

/** 카드 등록창이 돌려준 일회성 authKey를 영구 빌링키로 교환한다. 빌링키는 재조회가 불가능하므로 반드시 저장해야 한다. */
export async function issueBillingKey(params: { authKey: string; customerKey: string }): Promise<TossBillingKey> {
  const res = await fetch(`${TOSS_API_BASE}/billing/authorizations/issue`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ authKey: params.authKey, customerKey: params.customerKey })
  });
  if (!res.ok) {
    throw new Error(`Toss 빌링키 발급 실패: ${await readTossError(res)}`);
  }
  const json = (await res.json()) as {
    billingKey?: string;
    customerKey?: string;
    cardCompany?: string;
    cardNumber?: string;
    card?: { number?: string; issuerCode?: string };
    authenticatedAt?: string;
  };
  if (!json.billingKey) {
    throw new Error("Toss 빌링키 발급 실패: 응답에 billingKey가 없습니다.");
  }
  return {
    billingKey: json.billingKey,
    customerKey: json.customerKey ?? params.customerKey,
    cardCompany: json.cardCompany ?? null,
    cardNumber: json.cardNumber ?? json.card?.number ?? null,
    authenticatedAt: json.authenticatedAt ?? null
  };
}

/** 발급해 둔 빌링키로 결제를 승인한다. Idempotency-Key로 재시도 시 중복 청구를 막는다. */
export async function chargeBillingKey(params: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
}): Promise<TossBillingCharge> {
  const res = await fetch(`${TOSS_API_BASE}/billing/${encodeURIComponent(params.billingKey)}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID()
    },
    body: JSON.stringify({
      customerKey: params.customerKey,
      amount: params.amount,
      orderId: params.orderId,
      orderName: params.orderName
    })
  });
  if (!res.ok) {
    throw new Error(`Toss 자동결제 승인 실패: ${await readTossError(res)}`);
  }
  const json = (await res.json()) as {
    paymentKey?: string;
    orderId?: string;
    status?: string;
    totalAmount?: number;
    approvedAt?: string;
  };
  return {
    paymentKey: json.paymentKey ?? "",
    orderId: json.orderId ?? params.orderId,
    status: json.status ?? "UNKNOWN",
    totalAmount: json.totalAmount ?? params.amount,
    approvedAt: json.approvedAt ?? null
  };
}

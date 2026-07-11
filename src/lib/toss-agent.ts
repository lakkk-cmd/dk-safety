const TOSS_API_BASE = "https://api.tosspayments.com/v1";

export function authHeader(): string {
  const key = process.env.TOSS_SECRET_KEY?.trim();
  if (!key) throw new Error("TOSS_SECRET_KEY가 설정되지 않았습니다.");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  orderName?: string;
  method?: string;
  totalAmount: number;
  status: string;
  requestedAt: string;
  approvedAt?: string;
  currency?: string;
  card?: Record<string, unknown>;
  virtualAccount?: Record<string, unknown>;
};

/**
 * 기간별 결제 내역 조회
 * from/to: YYYY-MM-DD 형식 (현지 시각)
 */
export async function getPayments(from: string, to: string): Promise<TossPayment[]> {
  const params = new URLSearchParams({ startDate: from, endDate: to, limit: "100" });
  const res = await fetch(`${TOSS_API_BASE}/payments?${params.toString()}`, {
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(`Toss 결제 내역 조회 실패: ${res.status} ${err.message ?? ""}`);
  }

  const json = (await res.json()) as TossPayment[] | { payments?: TossPayment[] };
  return Array.isArray(json) ? json : (json.payments ?? []);
}

/** 단건 결제 상세 조회 */
export async function getPaymentDetail(paymentKey: string): Promise<TossPayment> {
  const res = await fetch(`${TOSS_API_BASE}/payments/${encodeURIComponent(paymentKey)}`, {
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(`Toss 결제 상세 조회 실패: ${res.status} ${err.message ?? ""}`);
  }

  return (await res.json()) as TossPayment;
}

/** Toss 정산 내역 조회 */
export async function getSettlements(from: string, to: string): Promise<unknown[]> {
  const params = new URLSearchParams({ startDate: from, endDate: to });
  const res = await fetch(`${TOSS_API_BASE}/settlements?${params.toString()}`, {
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(`Toss 정산 내역 조회 실패: ${res.status} ${err.message ?? ""}`);
  }
  const json = (await res.json()) as unknown[] | { settlements?: unknown[] };
  return Array.isArray(json) ? json : ((json as { settlements?: unknown[] }).settlements ?? []);
}

/** 오늘 매출 합계 */
export async function getDailyRevenue(): Promise<{ total: number; count: number; payments: TossPayment[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const payments = await getPayments(today, today);
  const total = payments.reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
  return { total, count: payments.length, payments };
}

/** 이번 달 누적 매출 */
export async function getMonthlyRevenue(): Promise<{ total: number; count: number; payments: TossPayment[] }> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const payments = await getPayments(from, to);
  const total = payments.reduce((sum, p) => sum + (p.totalAmount ?? 0), 0);
  return { total, count: payments.length, payments };
}

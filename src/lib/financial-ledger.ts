/**
 * 단순 수입/지출 원장(financial_ledger) — 정식 복식부기 대신 부호 있는 금액 하나로 표현.
 * 실제 기장은 DB 트리거(migration 085 trg_expense_to_ledger/trg_order_to_ledger)가 자동으로
 * 하므로, 여기서는 조회/수동전표/파생 리포트(손익계산서·미수금·예산·작업손익)만 다룬다.
 */
import { getSupabaseAdmin } from "@/lib/supabase-pg";

function sb() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase 미연결");
  return client;
}

export type LedgerEntry = {
  id: string;
  entry_date: string;
  category: string;
  amount: number;
  description: string | null;
  source_type: "order_payment" | "order_final_settlement" | "expense" | "refund" | "manual";
  source_id: string | null;
  reservation_id: string | null;
  vendor_id: string | null;
  created_at: string;
};

export const EXPENSE_CATEGORIES = ["재료비", "공구/장비", "교통비", "통신비", "광고비", "인건비", "기타"] as const;
const COST_OF_SALES_CATEGORIES = new Set(["재료비", "인건비"]);

export async function listLedgerEntries(opts?: {
  from?: string;
  to?: string;
  category?: string;
  sourceType?: string;
}): Promise<LedgerEntry[]> {
  let q = sb().from("financial_ledger").select("*").order("entry_date", { ascending: false });
  if (opts?.from) q = q.gte("entry_date", opts.from);
  if (opts?.to) q = q.lte("entry_date", opts.to);
  if (opts?.category) q = q.eq("category", opts.category);
  if (opts?.sourceType) q = q.eq("source_type", opts.sourceType);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LedgerEntry[];
}

export async function createManualLedgerEntry(input: {
  entry_date: string;
  category: string;
  amount: number;
  description: string | null;
  reservation_id?: string | null;
}): Promise<LedgerEntry> {
  const { data, error } = await sb()
    .from("financial_ledger")
    .insert({
      entry_date: input.entry_date,
      category: input.category,
      amount: input.amount,
      description: input.description,
      source_type: "manual",
      source_id: null,
      reservation_id: input.reservation_id ?? null
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as LedgerEntry;
}

export type IncomeStatement = {
  from: string;
  to: string;
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  sgaExpenses: number;
  operatingProfit: number;
  byCategory: { category: string; total: number }[];
};

export async function getIncomeStatement(range: { from: string; to: string }): Promise<IncomeStatement> {
  const { data, error } = await sb()
    .from("financial_ledger")
    .select("category, amount")
    .gte("entry_date", range.from)
    .lte("entry_date", range.to);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { category: string; amount: number }[];

  const catMap = new Map<string, number>();
  let revenue = 0;
  let costOfSales = 0;
  let sgaExpenses = 0;
  for (const r of rows) {
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.amount);
    if (r.amount > 0) {
      revenue += r.amount;
    } else if (COST_OF_SALES_CATEGORIES.has(r.category)) {
      costOfSales += -r.amount;
    } else {
      sgaExpenses += -r.amount;
    }
  }
  const grossProfit = revenue - costOfSales;
  const operatingProfit = grossProfit - sgaExpenses;

  return {
    from: range.from,
    to: range.to,
    revenue,
    costOfSales,
    grossProfit,
    sgaExpenses,
    operatingProfit,
    byCategory: Array.from(catMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  };
}

export type ReceivableItem = {
  orderId: string;
  reservationId: string | null;
  customerName: string;
  apartmentName: string | null;
  amountDue: number;
  requestedAt: string;
  agingDays: number;
};

/** 최종 정산 요청은 됐지만(final_payment_status='REQUESTED') 아직 입금 확인 전인 미수금 목록 */
export async function getReceivables(): Promise<ReceivableItem[]> {
  const { data, error } = await sb()
    .from("orders")
    .select(
      "id, reservation_id, resident_info, base_fee, total_final_fee, final_payment_status, updated_at, created_at, reservations(name, address)"
    )
    .eq("final_payment_status", "REQUESTED");
  if (error) throw new Error(error.message);

  const now = Date.now();
  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const residentInfo = (row.resident_info ?? {}) as { name?: string; dong?: string; ho?: string };
      const reservationJoin = row.reservations as { name?: string; address?: string } | { name?: string; address?: string }[] | null;
      const reservation = Array.isArray(reservationJoin) ? reservationJoin[0] : reservationJoin;
      const amountDue = Math.max(0, Number(row.total_final_fee ?? 0) - Number(row.base_fee ?? 0));
      const requestedAt = String(row.updated_at ?? row.created_at);
      const agingDays = Math.max(0, Math.floor((now - new Date(requestedAt).getTime()) / (24 * 60 * 60 * 1000)));
      return {
        orderId: row.id as string,
        reservationId: (row.reservation_id as string) ?? null,
        customerName: reservation?.name ?? residentInfo.name ?? "알수없음",
        apartmentName: reservation?.address ?? null,
        amountDue,
        requestedAt,
        agingDays
      };
    })
    .filter((item) => item.amountDue > 0)
    .sort((a, b) => b.agingDays - a.agingDays);
}

// ── Vendors (매입 거래처) ─────────────────────────────────────────────────────

export type Vendor = {
  id: string;
  name: string;
  business_number: string | null;
  phone: string | null;
  category: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
};

export async function listVendors(): Promise<Vendor[]> {
  const { data, error } = await sb().from("vendors").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Vendor[];
}

export async function createVendor(
  input: Pick<Vendor, "name" | "business_number" | "phone" | "category" | "note">
): Promise<Vendor> {
  const { data, error } = await sb().from("vendors").insert({ ...input, active: true }).select().single();
  if (error) throw new Error(error.message);
  return data as Vendor;
}

export async function updateVendor(id: string, patch: Partial<Omit<Vendor, "id" | "created_at">>): Promise<Vendor> {
  const { data, error } = await sb().from("vendors").update(patch).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as Vendor;
}

export async function deleteVendor(id: string): Promise<void> {
  const { error } = await sb().from("vendors").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getVendorSpendTotals(): Promise<{ vendorId: string; total: number }[]> {
  const { data, error } = await sb().from("financial_ledger").select("vendor_id, amount").not("vendor_id", "is", null);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { vendor_id: string; amount: number }[]) {
    map.set(row.vendor_id, (map.get(row.vendor_id) ?? 0) + -row.amount);
  }
  return Array.from(map.entries()).map(([vendorId, total]) => ({ vendorId, total }));
}

// ── Budgets (예산관리) ────────────────────────────────────────────────────────

export type Budget = { id: string; month: string; category: string; planned_amount: number };

export async function listBudgets(month: string): Promise<Budget[]> {
  const { data, error } = await sb().from("budgets").select("*").eq("month", month);
  if (error) throw new Error(error.message);
  return (data ?? []) as Budget[];
}

export async function upsertBudget(input: { month: string; category: string; planned_amount: number }): Promise<Budget> {
  const { data, error } = await sb()
    .from("budgets")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "month,category" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Budget;
}

export async function getBudgetProgress(month: string): Promise<{ category: string; planned: number; actual: number }[]> {
  const [budgets, ledgerRows] = await Promise.all([
    listBudgets(month),
    sb()
      .from("financial_ledger")
      .select("category, amount")
      .gte("entry_date", `${month}-01`)
      .lte("entry_date", `${month}-31`)
      .lt("amount", 0)
  ]);
  const ledgerError = (ledgerRows as { error?: { message: string } }).error;
  if (ledgerError) throw new Error(ledgerError.message);
  const actualMap = new Map<string, number>();
  for (const row of (ledgerRows.data ?? []) as { category: string; amount: number }[]) {
    actualMap.set(row.category, (actualMap.get(row.category) ?? 0) + -row.amount);
  }
  return budgets.map((b) => ({
    category: b.category,
    planned: b.planned_amount,
    actual: actualMap.get(b.category) ?? 0
  }));
}

// ── 작업(예약) 단위 손익 ───────────────────────────────────────────────────────

export type JobProfitability = { reservationId: string; revenue: number; expenses: number; profit: number };

export async function getJobProfitability(reservationId: string): Promise<JobProfitability> {
  const { data, error } = await sb().from("financial_ledger").select("amount").eq("reservation_id", reservationId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { amount: number }[];
  const revenue = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
  return { reservationId, revenue, expenses, profit: revenue - expenses };
}

/** 여러 예약의 손익을 한 번의 쿼리로 — 목록 화면에서 예약마다 개별 조회하지 않도록 */
export async function getJobProfitabilityBatch(reservationIds: string[]): Promise<Map<string, JobProfitability>> {
  const ids = reservationIds.filter(Boolean);
  const result = new Map<string, JobProfitability>();
  if (ids.length === 0) return result;
  const { data, error } = await sb().from("financial_ledger").select("reservation_id, amount").in("reservation_id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { reservation_id: string; amount: number }[]) {
    const existing = result.get(row.reservation_id) ?? { reservationId: row.reservation_id, revenue: 0, expenses: 0, profit: 0 };
    if (row.amount > 0) existing.revenue += row.amount;
    else existing.expenses += -row.amount;
    existing.profit = existing.revenue - existing.expenses;
    result.set(row.reservation_id, existing);
  }
  return result;
}

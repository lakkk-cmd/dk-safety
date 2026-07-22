import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type LedgerDirection = "IN" | "OUT";

export type AccountLedgerEntry = {
  id: string;
  entry_date: string;
  direction: LedgerDirection;
  amount: number;
  category: string;
  memo: string | null;
  created_at: string;
};

export type AccountBalanceCheckpoint = {
  id: string;
  checked_at: string;
  balance: number;
  memo: string | null;
  created_at: string;
};

export async function listLedgerEntries(limit = 100): Promise<AccountLedgerEntry[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("account_ledger_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`계좌 수기 기록 조회 실패: ${error.message}`);
  return (data ?? []) as AccountLedgerEntry[];
}

export async function createLedgerEntry(input: {
  entryDate: string;
  direction: LedgerDirection;
  amount: number;
  category: string;
  memo?: string | null;
}): Promise<AccountLedgerEntry> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("account_ledger_entries")
    .insert({
      entry_date: input.entryDate,
      direction: input.direction,
      amount: Math.round(input.amount),
      category: input.category.trim() || "기타",
      memo: input.memo?.trim() || null
    })
    .select()
    .single();
  if (error || !data) throw new Error(`계좌 수기 기록 저장 실패: ${error?.message ?? "unknown"}`);
  return data as AccountLedgerEntry;
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from("account_ledger_entries").delete().eq("id", id.trim());
  if (error) throw new Error(`계좌 수기 기록 삭제 실패: ${error.message}`);
}

export async function listBalanceCheckpoints(limit = 20): Promise<AccountBalanceCheckpoint[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("account_balance_checkpoints")
    .select("*")
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`계좌 잔액 스냅샷 조회 실패: ${error.message}`);
  return (data ?? []) as AccountBalanceCheckpoint[];
}

export async function createBalanceCheckpoint(input: { balance: number; memo?: string | null; checkedAt?: string }): Promise<AccountBalanceCheckpoint> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("account_balance_checkpoints")
    .insert({
      balance: Math.round(input.balance),
      memo: input.memo?.trim() || null,
      ...(input.checkedAt ? { checked_at: input.checkedAt } : {})
    })
    .select()
    .single();
  if (error || !data) throw new Error(`계좌 잔액 스냅샷 저장 실패: ${error?.message ?? "unknown"}`);
  return data as AccountBalanceCheckpoint;
}

export type ReconciliationResult = {
  checkpoint: AccountBalanceCheckpoint | null;
  autoDepositTotal: number;
  autoRefundTotal: number;
  manualRefundTotal: number;
  expenseTotal: number;
  manualLedgerInTotal: number;
  manualLedgerOutTotal: number;
  expectedBalance: number;
};

/**
 * "장부상 예상 잔액" 계산 — 가장 최근 계좌 잔액 스냅샷(checkpoint) 이후로 시스템에 이미
 * 기록된 입출금(가상계좌 입금/자동·수동 환불/경비)과 수기 입력분을 합산한다. 은행 API가
 * 없어 실시간 잔액 조회는 불가능하므로, 관리자가 주기적으로 실제 통장 잔액을 입력해두면
 * 그 시점부터의 변동만 추적해 "지금쯤 이 정도여야 한다"는 값을 계산하고, 관리자가 실제
 * 통장을 보고 비교(대사)할 수 있게 한다.
 */
export async function computeReconciliation(): Promise<ReconciliationResult> {
  const supabase = requireSupabaseAdmin();
  const checkpoints = await listBalanceCheckpoints(1);
  const checkpoint = checkpoints[0] ?? null;
  const sinceIso = checkpoint?.checked_at ?? "1970-01-01T00:00:00.000Z";
  const sinceDate = sinceIso.slice(0, 10);

  const [depositsRes, refundsRes, manualRefundsRes, expensesRes, ledgerRes] = await Promise.all([
    supabase.from("orders").select("virtual_account_amount, base_fee").eq("payment_status", "PAID").gt("paid_at", sinceIso),
    supabase.from("orders").select("refund_amount").gt("cancelled_at", sinceIso).not("refund_amount", "is", null),
    supabase.from("orders").select("manual_refund_amount").gt("manual_refund_completed_at", sinceIso).not("manual_refund_amount", "is", null),
    supabase.from("expenses").select("amount").gt("expense_date", sinceDate),
    supabase.from("account_ledger_entries").select("direction, amount").gt("entry_date", sinceDate)
  ]);
  if (depositsRes.error) throw new Error(`입금 집계 실패: ${depositsRes.error.message}`);
  if (refundsRes.error) throw new Error(`자동환불 집계 실패: ${refundsRes.error.message}`);
  if (manualRefundsRes.error) throw new Error(`수동환불 집계 실패: ${manualRefundsRes.error.message}`);
  if (expensesRes.error) throw new Error(`경비 집계 실패: ${expensesRes.error.message}`);
  if (ledgerRes.error) throw new Error(`수기 기록 집계 실패: ${ledgerRes.error.message}`);

  const autoDepositTotal = (depositsRes.data ?? []).reduce(
    (sum, o: { virtual_account_amount: number | null; base_fee: number | null }) => sum + (o.virtual_account_amount ?? o.base_fee ?? 0),
    0
  );
  const autoRefundTotal = (refundsRes.data ?? []).reduce((sum, o: { refund_amount: number | null }) => sum + (o.refund_amount ?? 0), 0);
  const manualRefundTotal = (manualRefundsRes.data ?? []).reduce(
    (sum, o: { manual_refund_amount: number | null }) => sum + (o.manual_refund_amount ?? 0),
    0
  );
  const expenseTotal = (expensesRes.data ?? []).reduce((sum, e: { amount: number }) => sum + e.amount, 0);
  const manualLedgerInTotal = (ledgerRes.data ?? [])
    .filter((e: { direction: string }) => e.direction === "IN")
    .reduce((sum, e: { amount: number }) => sum + e.amount, 0);
  const manualLedgerOutTotal = (ledgerRes.data ?? [])
    .filter((e: { direction: string }) => e.direction === "OUT")
    .reduce((sum, e: { amount: number }) => sum + e.amount, 0);

  const expectedBalance =
    (checkpoint?.balance ?? 0) +
    autoDepositTotal -
    autoRefundTotal -
    manualRefundTotal -
    expenseTotal +
    manualLedgerInTotal -
    manualLedgerOutTotal;

  return {
    checkpoint,
    autoDepositTotal,
    autoRefundTotal,
    manualRefundTotal,
    expenseTotal,
    manualLedgerInTotal,
    manualLedgerOutTotal,
    expectedBalance
  };
}

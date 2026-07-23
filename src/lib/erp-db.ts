import { pgReadReservations } from "@/lib/reservations-pg";
import { getSupabaseAdmin } from "@/lib/supabase-pg";
import { getReceivables } from "@/lib/financial-ledger";

export type WorkerRow = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  certifications: string | null;
  worker_type: "employee" | "contractor";
  specialty: string[];
  hourly_rate: number | null;
  daily_rate: number | null;
  worker_note: string | null;
  created_at: string;
};

export type InvoiceItem = {
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_business_number: string | null;
  customer_address: string | null;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  type: "tax_invoice" | "receipt" | "quote";
  status: "draft" | "sent" | "paid" | "cancelled";
  issued_at: string;
  due_at: string | null;
  reservation_id: string | null;
  pdf_url: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  category: string;
  subcategory: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  expense_date: string;
  payment_method: string;
  reservation_id: string | null;
  vendor_id: string | null;
  created_at: string;
};

export type WorkerAssignment = {
  id: string;
  reservation_id: string;
  worker_id: string;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  pay_amount: number | null;
  note: string | null;
};

function sb() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase 미연결");
  return client;
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `INV-${yyyymmdd}-${rand}`;
}

// ── Workers ─────────────────────────────────────────────────────────────────

export async function listWorkers(): Promise<WorkerRow[]> {
  const { data, error } = await sb()
    .from("workers")
    .select("id,name,phone,active,certifications,worker_type,specialty,hourly_rate,daily_rate,worker_note,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkerRow[];
}

export async function createWorker(
  input: Pick<WorkerRow, "name" | "phone" | "worker_type" | "specialty" | "hourly_rate" | "daily_rate" | "worker_note" | "certifications">
): Promise<WorkerRow> {
  const { data, error } = await sb()
    .from("workers")
    .insert({ ...input, active: true, pin_hash: "" })
    .select("id,name,phone,active,certifications,worker_type,specialty,hourly_rate,daily_rate,worker_note,created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as WorkerRow;
}

export async function updateWorker(
  id: string,
  patch: Partial<Omit<WorkerRow, "id" | "created_at">>
): Promise<void> {
  const { error } = await sb().from("workers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteWorker(id: string): Promise<void> {
  const { error } = await sb().from("workers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export async function listExpenses(opts?: { month?: string }): Promise<Expense[]> {
  let q = sb()
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false });
  if (opts?.month) {
    q = q.gte("expense_date", `${opts.month}-01`).lte("expense_date", `${opts.month}-31`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Expense[];
}

export async function createExpense(input: Omit<Expense, "id" | "created_at">): Promise<Expense> {
  const { data, error } = await sb().from("expenses").insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Expense;
}

export type CategoryStat = { category: string; total: number };

export async function getExpenseStats(months: number = 6): Promise<{
  monthly: { month: string; total: number }[];
  byCategory: CategoryStat[];
}> {
  const from = new Date();
  from.setMonth(from.getMonth() - months + 1);
  from.setDate(1);
  const { data, error } = await sb()
    .from("expenses")
    .select("expense_date, amount, category")
    .gte("expense_date", from.toISOString().slice(0, 10));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { expense_date: string; amount: number; category: string }[];

  const monthMap = new Map<string, number>();
  const catMap = new Map<string, number>();
  for (const r of rows) {
    const m = r.expense_date.slice(0, 7);
    monthMap.set(m, (monthMap.get(m) ?? 0) + r.amount);
    catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.amount);
  }

  const monthly = Array.from(monthMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const byCategory = Array.from(catMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  return { monthly, byCategory };
}

// ── Invoices ─────────────────────────────────────────────────────────────────

export async function listInvoices(opts?: { status?: string; type?: string }): Promise<Invoice[]> {
  let q = sb().from("invoices").select("*").order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.type) q = q.eq("type", opts.type);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Invoice[];
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await sb().from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Invoice | null;
}

export async function createInvoice(
  input: Omit<Invoice, "id" | "invoice_number" | "created_at">
): Promise<Invoice> {
  const invoice_number = generateInvoiceNumber();
  const { data, error } = await sb()
    .from("invoices")
    .insert({ ...input, invoice_number })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Invoice;
}

export async function updateInvoiceStatus(
  id: string,
  status: Invoice["status"]
): Promise<void> {
  const { error } = await sb().from("invoices").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Worker Assignments ────────────────────────────────────────────────────────

export async function listAssignments(reservationId: string): Promise<WorkerAssignment[]> {
  const { data, error } = await sb()
    .from("worker_assignments")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkerAssignment[];
}

export async function createAssignment(
  input: Omit<WorkerAssignment, "id" | "assigned_at">
): Promise<WorkerAssignment> {
  const { data, error } = await sb()
    .from("worker_assignments")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as WorkerAssignment;
}

// ── Worker Settlement (기사 수당 정산) ─────────────────────────────────────────
// 완료된 작업(reservations.status='완료')에 기사가 배정돼(tasks.worker_id) 있는데
// 아직 worker_assignments에 정산 기록이 없는 건 = 정산 대기. rate 계산은 hours 추적이
// 없어 일당(daily_rate)을 우선, 없으면 시급(hourly_rate)을 건당 제안값으로만 쓴다
// (관리자가 금액을 확인/수정 후 확정).

export type PendingSettlement = {
  reservationId: string;
  workerId: string;
  workerName: string;
  serviceType: string;
  address: string;
  completedDate: string;
  suggestedAmount: number;
};

export type SettlementHistoryItem = {
  id: string;
  reservationId: string;
  workerId: string;
  workerName: string;
  payAmount: number | null;
  note: string | null;
  completedAt: string | null;
};

export async function listPendingSettlements(): Promise<PendingSettlement[]> {
  const [reservations, workers, { data: existing, error }] = await Promise.all([
    pgReadReservations(),
    listWorkers(),
    sb().from("worker_assignments").select("reservation_id"),
  ]);
  if (error) throw new Error(error.message);

  const settledReservationIds = new Set((existing ?? []).map((r) => r.reservation_id as string));
  const workerById = new Map(workers.map((w) => [w.id, w] as const));

  return reservations
    .filter((r) => r.status === "완료" && r.assignedWorkerId && !settledReservationIds.has(r.id))
    .map((r) => {
      const worker = workerById.get(r.assignedWorkerId as string);
      const suggestedAmount = worker?.daily_rate ?? worker?.hourly_rate ?? 0;
      return {
        reservationId: r.id,
        workerId: r.assignedWorkerId as string,
        workerName: r.assignedWorkerName ?? worker?.name ?? "알 수 없음",
        serviceType: r.serviceType,
        address: r.address,
        completedDate: r.preferredDate,
        suggestedAmount,
      };
    });
}

export async function listSettlementHistory(limit = 50): Promise<SettlementHistoryItem[]> {
  const { data, error } = await sb()
    .from("worker_assignments")
    .select("id, reservation_id, worker_id, pay_amount, note, completed_at, workers(name)")
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const workerJoin = row.workers as { name: string } | { name: string }[] | null;
    const workerName = Array.isArray(workerJoin) ? workerJoin[0]?.name : workerJoin?.name;
    return {
      id: row.id as string,
      reservationId: row.reservation_id as string,
      workerId: row.worker_id as string,
      workerName: workerName ?? "알 수 없음",
      payAmount: row.pay_amount as number | null,
      note: row.note as string | null,
      completedAt: row.completed_at as string | null,
    };
  });
}

export async function settleWorkerAssignment(input: {
  reservationId: string;
  workerId: string;
  payAmount: number;
  note: string | null;
  expenseDate: string;
  expenseDescription: string;
}): Promise<{ assignmentId: string; expenseId: string }> {
  const { data, error } = await sb().rpc("settle_worker_assignment", {
    p_reservation_id: input.reservationId,
    p_worker_id: input.workerId,
    p_pay_amount: input.payAmount,
    p_note: input.note,
    p_expense_date: input.expenseDate,
    p_expense_description: input.expenseDescription,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { assignment_id: string; expense_id: string };
  return { assignmentId: row.assignment_id, expenseId: row.expense_id };
}

// ── Dashboard Stats ───────────────────────────────────────────────────────────
// 2026-07-23: 이 함수는 원래 invoices(견적/영수증) 테이블 기준으로 매출을 집계했으나,
// invoices는 실제 결제 파이프라인(orders)과 분리된 수기 발행 문서일 뿐이라 프로덕션에
// 0건 상태로 남아 있었고 그 결과 "총 매출"이 계속 0원으로 표시되어 왔다. 실제 자금 흐름을
// 자동 기록하는 financial_ledger(migration 085)로 소스를 교체해 이 연동 문제를 고친다.

export type DashboardStats = {
  revenue: number;
  expenses: number;
  profit: number;
  jobCount: number;
  monthly: { month: string; revenue: number; expenses: number }[];
  receivablesTotal: number;
};

export async function getDashboardStats(months: number = 6): Promise<DashboardStats> {
  const client = sb();
  const from = new Date();
  from.setMonth(from.getMonth() - months + 1);
  from.setDate(1);
  const fromStr = from.toISOString().slice(0, 10);

  const [ledgerRes, reservationsRes, receivables] = await Promise.all([
    client.from("financial_ledger").select("amount, entry_date").gte("entry_date", fromStr),
    client.from("reservations").select("id, preferred_date").gte("preferred_date", fromStr),
    getReceivables()
  ]);

  const ledgerRows = (ledgerRes.data ?? []) as { amount: number; entry_date: string }[];
  const jobs = (reservationsRes.data ?? []) as { id: string; preferred_date: string }[];

  const revenue = ledgerRows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expenses = ledgerRows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);

  const revMap = new Map<string, number>();
  const expMap = new Map<string, number>();
  for (const r of ledgerRows) {
    const m = r.entry_date.slice(0, 7);
    if (r.amount > 0) revMap.set(m, (revMap.get(m) ?? 0) + r.amount);
    else expMap.set(m, (expMap.get(m) ?? 0) + -r.amount);
  }

  // Build last N months
  const months6: { month: string; revenue: number; expenses: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const m = d.toISOString().slice(0, 7);
    months6.push({ month: m, revenue: revMap.get(m) ?? 0, expenses: expMap.get(m) ?? 0 });
  }

  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    jobCount: jobs.length,
    monthly: months6,
    receivablesTotal: receivables.reduce((s, r) => s + r.amountDue, 0)
  };
}

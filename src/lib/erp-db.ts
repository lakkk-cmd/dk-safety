import { getSupabaseAdmin } from "@/lib/supabase-pg";

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

// ── Dashboard Stats ───────────────────────────────────────────────────────────

export type DashboardStats = {
  revenue: number;
  expenses: number;
  profit: number;
  jobCount: number;
  monthly: { month: string; revenue: number; expenses: number }[];
  unpaidInvoices: Invoice[];
};

export async function getDashboardStats(months: number = 6): Promise<DashboardStats> {
  const client = sb();
  const from = new Date();
  from.setMonth(from.getMonth() - months + 1);
  from.setDate(1);
  const fromStr = from.toISOString().slice(0, 10);

  const [invoicesRes, expensesRes, reservationsRes] = await Promise.all([
    client.from("invoices").select("total, status, issued_at").gte("issued_at", fromStr),
    client.from("expenses").select("amount, expense_date").gte("expense_date", fromStr),
    client.from("reservations").select("id, preferred_date").gte("preferred_date", fromStr),
  ]);

  const invoices = (invoicesRes.data ?? []) as { total: number; status: string; issued_at: string }[];
  const exps = (expensesRes.data ?? []) as { amount: number; expense_date: string }[];
  const jobs = (reservationsRes.data ?? []) as { id: string; preferred_date: string }[];

  const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const expenses = exps.reduce((s, e) => s + e.amount, 0);

  const revMap = new Map<string, number>();
  const expMap = new Map<string, number>();
  for (const i of invoices.filter((i) => i.status === "paid")) {
    const m = i.issued_at.slice(0, 7);
    revMap.set(m, (revMap.get(m) ?? 0) + i.total);
  }
  for (const e of exps) {
    const m = e.expense_date.slice(0, 7);
    expMap.set(m, (expMap.get(m) ?? 0) + e.amount);
  }

  // Build last N months
  const months6: { month: string; revenue: number; expenses: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const m = d.toISOString().slice(0, 7);
    months6.push({ month: m, revenue: revMap.get(m) ?? 0, expenses: expMap.get(m) ?? 0 });
  }

  const { data: unpaid } = await client
    .from("invoices")
    .select("*")
    .in("status", ["draft", "sent"])
    .order("due_at", { ascending: true })
    .limit(10);

  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    jobCount: jobs.length,
    monthly: months6,
    unpaidInvoices: (unpaid ?? []) as Invoice[],
  };
}

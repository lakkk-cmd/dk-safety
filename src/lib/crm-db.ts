import { getSupabaseAdmin } from "@/lib/supabase-pg";

export type ConsultationLog = {
  id: string;
  customer_phone: string;
  customer_name: string;
  channel: "phone" | "kakao" | "visit" | "sms";
  content: string;
  next_contact_at: string | null;
  status: "pending" | "resolved" | "follow_up";
  result: string | null;
  worker_id: string | null;
  created_at: string;
};

export type FollowUpReminder = {
  id: string;
  consultation_id: string | null;
  customer_name: string;
  customer_phone: string;
  remind_at: string;
  message: string;
  status: "pending" | "sent" | "skipped";
  created_at: string;
};

export type CustomerSummary = {
  phone: string;
  name: string;
  address: string | null;
  serviceCount: number;
  lastServiceDate: string | null;
  nextFollowUp: string | null;
};

function sb() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase 미연결");
  return client;
}

export async function listConsultationLogs(phone?: string): Promise<ConsultationLog[]> {
  let q = sb()
    .from("consultation_logs")
    .select("*")
    .order("created_at", { ascending: false });
  if (phone) q = q.eq("customer_phone", phone);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ConsultationLog[];
}

export async function createConsultationLog(
  input: Omit<ConsultationLog, "id" | "created_at">
): Promise<ConsultationLog> {
  const { data, error } = await sb()
    .from("consultation_logs")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ConsultationLog;
}

export async function updateConsultationLog(
  id: string,
  patch: Partial<Pick<ConsultationLog, "status" | "result" | "next_contact_at">>
): Promise<void> {
  const { error } = await sb().from("consultation_logs").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createFollowUpReminder(
  input: Omit<FollowUpReminder, "id" | "created_at">
): Promise<FollowUpReminder> {
  const { data, error } = await sb()
    .from("follow_up_reminders")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FollowUpReminder;
}

export async function listFollowUpReminders(opts?: {
  from?: string;
  to?: string;
  status?: string;
}): Promise<FollowUpReminder[]> {
  let q = sb()
    .from("follow_up_reminders")
    .select("*")
    .order("remind_at", { ascending: true });
  if (opts?.from) q = q.gte("remind_at", opts.from);
  if (opts?.to) q = q.lte("remind_at", opts.to);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowUpReminder[];
}

export async function updateFollowUpStatus(
  id: string,
  status: "sent" | "skipped"
): Promise<void> {
  const { error } = await sb().from("follow_up_reminders").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listCustomerSummary(search?: string): Promise<CustomerSummary[]> {
  const client = sb();
  let q = client
    .from("reservations")
    .select("name, phone, address, preferred_date")
    .order("preferred_date", { ascending: false });
  if (search) {
    q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Group by phone
  const map = new Map<string, CustomerSummary>();
  for (const r of (data ?? []) as { name: string; phone: string; address: string; preferred_date: string }[]) {
    if (!r.phone) continue;
    if (!map.has(r.phone)) {
      map.set(r.phone, {
        phone: r.phone,
        name: r.name,
        address: r.address ?? null,
        serviceCount: 0,
        lastServiceDate: null,
        nextFollowUp: null,
      });
    }
    const entry = map.get(r.phone)!;
    entry.serviceCount += 1;
    if (!entry.lastServiceDate || r.preferred_date > entry.lastServiceDate) {
      entry.lastServiceDate = r.preferred_date;
    }
  }

  // Attach nearest pending follow-up
  const phones = Array.from(map.keys());
  if (phones.length > 0) {
    const now = new Date().toISOString();
    const { data: reminders } = await client
      .from("follow_up_reminders")
      .select("customer_phone, remind_at")
      .in("customer_phone", phones)
      .eq("status", "pending")
      .gte("remind_at", now)
      .order("remind_at", { ascending: true });
    for (const rem of (reminders ?? []) as { customer_phone: string; remind_at: string }[]) {
      const entry = map.get(rem.customer_phone);
      if (entry && !entry.nextFollowUp) entry.nextFollowUp = rem.remind_at;
    }
  }

  return Array.from(map.values());
}

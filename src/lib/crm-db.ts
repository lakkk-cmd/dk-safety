import { getSupabaseAdmin } from "@/lib/supabase-pg";
import { normalizePhone } from "@/lib/reservation-validation";

export type ConsultationSource = "unit_inspection" | "manual_lead" | "excel_import" | "consultation";

export const CONSULTATION_SOURCE_LABEL: Record<ConsultationSource, string> = {
  unit_inspection: "세대전기점검",
  manual_lead: "관리자 직접등록",
  excel_import: "엑셀 일괄등록",
  consultation: "상담 기록"
};

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
  /** 이 고객이 시스템에 처음 등록된 경로 — channel(상담 수단)과는 별개 개념. 2026-08-24 이전 레거시
   *  행은 패턴 매칭으로 소급 분류했고, 그마저 안 걸리면 null(확인불가)로 남는다. */
  source: ConsultationSource | null;
  /** 등록 시점에 알 수 있었던 주소. 모르면 null. */
  address: string | null;
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
  /** "예약"(reservations에 예약 이력이 있음) 또는 ConsultationSource 라벨. 둘 다 없으면 null(확인불가). */
  registeredVia: string | null;
  /** 이 고객이 시스템에 처음 등록된 시각 — 예약 고객은 최초 예약 생성일, 잠재고객은 최초 상담기록 생성일. */
  registeredAt: string | null;
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
    .select("name, phone, address, preferred_date, created_at")
    .order("preferred_date", { ascending: false });
  if (search) {
    q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,address.ilike.%${search}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Group by phone — 표시 형식이 뒤섞이면(하이픈 유무) 같은 사람이 서로 다른 키로 잡혀 행이
  // 갈라지므로, 맵 키·표시값 둘 다 항상 normalizePhone()을 거친 값을 쓴다(2026-08-24).
  const map = new Map<string, CustomerSummary>();
  for (const r of (data ?? []) as { name: string; phone: string; address: string; preferred_date: string; created_at: string }[]) {
    if (!r.phone) continue;
    const phone = normalizePhone(r.phone);
    if (!map.has(phone)) {
      map.set(phone, {
        phone,
        name: r.name,
        address: r.address ?? null,
        serviceCount: 0,
        lastServiceDate: null,
        nextFollowUp: null,
        registeredVia: "예약",
        registeredAt: r.created_at
      });
    }
    const entry = map.get(phone)!;
    entry.serviceCount += 1;
    if (!entry.lastServiceDate || r.preferred_date > entry.lastServiceDate) {
      entry.lastServiceDate = r.preferred_date;
    }
    if (!entry.registeredAt || r.created_at < entry.registeredAt) {
      entry.registeredAt = r.created_at; // 최초 예약 시각 = 이 고객의 등록일
    }
  }

  // 예약은 아직 없고 상담 기록(잠재고객 등록 포함)만 있는 사람도 고객 목록에 포함시킨다 —
  // 그렇지 않으면 "명함만 등록해둔" 잠재고객이 목록에서 아예 안 보이게 된다. 등록경로/등록일/주소를
  // 보여주기 위해(2026-08-24), 오름차순으로 읽어 각 전화번호의 "처음" 상담기록(=최초 등록 시점)을
  // 취한다 — 나중 상담(재방문 등)이 처음 등록 정보를 덮어쓰지 않도록.
  let cq = client
    .from("consultation_logs")
    .select("customer_name, customer_phone, address, source, created_at")
    .order("created_at", { ascending: true });
  if (search) {
    cq = cq.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,address.ilike.%${search}%`);
  }
  const { data: consultRows } = await cq;
  for (const c of (consultRows ?? []) as {
    customer_name: string;
    customer_phone: string;
    address: string | null;
    source: ConsultationSource | null;
    created_at: string;
  }[]) {
    if (!c.customer_phone) continue;
    const phone = normalizePhone(c.customer_phone);
    if (map.has(phone)) continue;
    map.set(phone, {
      phone,
      name: c.customer_name,
      address: c.address ?? null,
      serviceCount: 0,
      lastServiceDate: null,
      nextFollowUp: null,
      registeredVia: c.source ? CONSULTATION_SOURCE_LABEL[c.source] : null,
      registeredAt: c.created_at
    });
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

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

/**
 * 고객 프로필의 단일 소스(126, 2026-09-10) — 예약/상담기록은 각자의 시점 스냅샷(name/phone/address)을
 * 그대로 보존하고, 이 테이블만 관리자가 직접 수정하는 "현재 고객정보"를 담는다. 새 예약·상담기록이
 * 들어와도 이름/주소가 다르면 프로필은 절대 자동으로 덮어쓰지 않는다(대표님 결정) — 관리자가
 * 명시적으로 수정할 때만 바뀐다.
 */
export type CrmCustomer = {
  id: string;
  phone: string;
  name: string;
  address: string | null;
  registeredVia: string | null;
  registeredAt: string;
  hiddenAt: string | null;
  mergedIntoId: string | null;
};

export type CustomerSummary = {
  id: string;
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
  const customerId = await findOrCreateCrmCustomerBestEffort({
    phone: input.customer_phone,
    name: input.customer_name,
    address: input.address,
    registeredVia: input.source ? CONSULTATION_SOURCE_LABEL[input.source] : "상담 기록"
  });
  const { data, error } = await sb()
    .from("consultation_logs")
    .insert({ ...input, customer_id: customerId })
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

/**
 * 전화번호로 crm_customers를 찾는다 — 대표 전화번호(crm_customers.phone) 또는 병합으로 흡수된
 * 예전 번호(crm_customer_alt_phones)까지 확인해, 예전 번호로 다시 연락이 와도 같은 고객으로
 * 인식한다. 대표 고객(hidden_at/merged_into_id 없는 살아있는 행)의 id를 반환한다.
 */
async function findCrmCustomerIdByPhone(phone: string): Promise<string | null> {
  const client = sb();
  const normalized = normalizePhone(phone);

  const { data: direct } = await client.from("crm_customers").select("id, merged_into_id").eq("phone", normalized).maybeSingle();
  if (direct) return direct.merged_into_id ?? direct.id;

  const { data: alt } = await client.from("crm_customer_alt_phones").select("customer_id").eq("phone", normalized).maybeSingle();
  if (alt) {
    const { data: cust } = await client.from("crm_customers").select("id, merged_into_id").eq("id", alt.customer_id).maybeSingle();
    if (cust) return cust.merged_into_id ?? cust.id;
  }
  return null;
}

/**
 * 전화번호로 고객을 찾거나 없으면 새로 만든다. 이미 있으면 절대 이름/주소를 덮어쓰지 않는다
 * (대표님 결정, 2026-09-10) — 새 예약·상담기록은 그 시점 값을 자기 행에만 스냅샷으로 남기고,
 * 고객 프로필은 관리자가 화면에서 명시적으로 수정할 때만 바뀐다.
 */
export async function findOrCreateCrmCustomer(params: {
  phone: string;
  name: string;
  address?: string | null;
  registeredVia: string | null;
}): Promise<string> {
  const normalized = normalizePhone(params.phone);
  const existingId = await findCrmCustomerIdByPhone(normalized);
  if (existingId) return existingId;

  const { data, error } = await sb()
    .from("crm_customers")
    .upsert(
      {
        phone: normalized,
        name: params.name,
        address: params.address ?? null,
        registered_via: params.registeredVia,
        registered_at: new Date().toISOString()
      },
      { onConflict: "phone" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`고객 프로필 생성 실패: ${error?.message ?? "unknown"}`);
  return data.id;
}

/** 예약/상담기록 생성 흐름에서 호출하는 안전판 — 고객 연결이 실패해도 원본 생성 자체는 막지 않는다. */
export async function findOrCreateCrmCustomerBestEffort(params: {
  phone: string;
  name: string;
  address?: string | null;
  registeredVia: string | null;
}): Promise<string | null> {
  if (!params.phone) return null;
  try {
    return await findOrCreateCrmCustomer(params);
  } catch (error) {
    console.error(`고객 프로필 연결 실패(${params.phone}):`, error);
    return null;
  }
}

export async function updateCrmCustomer(
  id: string,
  update: { name: string; phone: string; address: string | null }
): Promise<void> {
  const { data, error } = await sb()
    .from("crm_customers")
    .update({
      name: update.name.trim(),
      phone: normalizePhone(update.phone),
      address: update.address?.trim() || null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("대상 고객을 찾을 수 없습니다.");
}

/** 체크박스 "삭제" = 목록 숨김. 원본 예약·상담기록은 그대로 둔다(대표님 결정). */
export async function hideCrmCustomers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await sb().from("crm_customers").update({ hidden_at: new Date().toISOString() }).in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * 동일인이 번호 변경 등으로 두 고객으로 나뉜 경우 관리자가 수동 병합한다. secondaryIds의 예약·
 * 상담기록·재상담알림을 전부 primaryId로 재연결하고, secondary의 전화번호는 예전 번호로
 * crm_customer_alt_phones에 보존해 다음에 그 번호로 연락이 와도 같은 고객으로 잡히게 한다.
 * secondary 행 자체는 hidden_at + merged_into_id만 채우고 삭제하지 않는다(추적 가능하게).
 */
export async function mergeCrmCustomers(primaryId: string, secondaryIds: string[]): Promise<void> {
  const client = sb();
  for (const secondaryId of secondaryIds) {
    if (secondaryId === primaryId) continue;
    const { data: secondary, error: getErr } = await client
      .from("crm_customers")
      .select("id, phone")
      .eq("id", secondaryId)
      .single();
    if (getErr || !secondary) throw new Error(getErr?.message ?? "병합 대상 고객을 찾을 수 없습니다.");

    const { error: resErr } = await client.from("reservations").update({ customer_id: primaryId }).eq("customer_id", secondaryId);
    if (resErr) throw new Error(`예약 재연결 실패: ${resErr.message}`);
    const { error: conErr } = await client.from("consultation_logs").update({ customer_id: primaryId }).eq("customer_id", secondaryId);
    if (conErr) throw new Error(`상담기록 재연결 실패: ${conErr.message}`);
    const { error: remErr } = await client.from("follow_up_reminders").update({ customer_id: primaryId }).eq("customer_id", secondaryId);
    if (remErr) throw new Error(`재상담알림 재연결 실패: ${remErr.message}`);

    // secondary의 alt phone들도 primary 쪽으로 옮긴다(연쇄 병합 대비).
    await client.from("crm_customer_alt_phones").update({ customer_id: primaryId }).eq("customer_id", secondaryId);

    const { error: altErr } = await client
      .from("crm_customer_alt_phones")
      .upsert({ customer_id: primaryId, phone: secondary.phone }, { onConflict: "phone" });
    if (altErr) throw new Error(`예전 번호 보존 실패: ${altErr.message}`);

    const { error: hideErr } = await client
      .from("crm_customers")
      .update({ hidden_at: new Date().toISOString(), merged_into_id: primaryId })
      .eq("id", secondaryId);
    if (hideErr) throw new Error(`병합 처리 실패: ${hideErr.message}`);
  }
}

export type ListCustomerSummaryResult = { customers: CustomerSummary[]; total: number };

/** 관리자 화면용 — 10건씩 페이지네이션(2026-09-10), 숨김(hidden_at) 고객은 제외. */
export async function listCustomerSummary(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListCustomerSummaryResult> {
  const client = sb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 10);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = client
    .from("crm_customers")
    .select("id, phone, name, address, registered_via, registered_at", { count: "exact" })
    .is("hidden_at", null)
    .order("registered_at", { ascending: false });
  if (params.search) {
    const s = params.search;
    q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,address.ilike.%${s}%`);
  }
  const { data, error, count } = await q.range(from, to);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    phone: string;
    name: string;
    address: string | null;
    registered_via: string | null;
    registered_at: string;
  }[];
  const customerIds = rows.map((r) => r.id);

  const summaries = new Map<string, CustomerSummary>();
  for (const r of rows) {
    summaries.set(r.id, {
      id: r.id,
      phone: r.phone,
      name: r.name,
      address: r.address,
      serviceCount: 0,
      lastServiceDate: null,
      nextFollowUp: null,
      registeredVia: r.registered_via,
      registeredAt: r.registered_at
    });
  }

  if (customerIds.length > 0) {
    const { data: resRows } = await client
      .from("reservations")
      .select("customer_id, preferred_date")
      .in("customer_id", customerIds);
    for (const r of (resRows ?? []) as { customer_id: string | null; preferred_date: string }[]) {
      if (!r.customer_id) continue;
      const entry = summaries.get(r.customer_id);
      if (!entry) continue;
      entry.serviceCount += 1;
      if (!entry.lastServiceDate || r.preferred_date > entry.lastServiceDate) {
        entry.lastServiceDate = r.preferred_date;
      }
    }

    const now = new Date().toISOString();
    const { data: reminders } = await client
      .from("follow_up_reminders")
      .select("customer_id, remind_at")
      .in("customer_id", customerIds)
      .eq("status", "pending")
      .gte("remind_at", now)
      .order("remind_at", { ascending: true });
    for (const rem of (reminders ?? []) as { customer_id: string | null; remind_at: string }[]) {
      if (!rem.customer_id) continue;
      const entry = summaries.get(rem.customer_id);
      if (entry && !entry.nextFollowUp) entry.nextFollowUp = rem.remind_at;
    }
  }

  return { customers: rows.map((r) => summaries.get(r.id)!), total: count ?? rows.length };
}

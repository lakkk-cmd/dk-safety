import type { Reservation } from "@/lib/reservations-store";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import {
  activate_assignment,
  buildPatentWarrantyNumber,
  calculate_final_fee,
  match_technician,
  type ServiceItem
} from "@/lib/daekyung-fee-logic";

type TaskRow = {
  id: string;
  status: "assigned" | "in_progress" | "completed";
  worker_id: string | null;
  accepted_at?: string | null;
  workers: { name: string } | { name: string }[] | null;
};

type ServiceItemRow = {
  id: string;
  service_type: string;
  name: string;
  min_fee: number | null;
  max_fee: number | null;
  unit_price: number | null;
  surcharge_flag: boolean | null;
  bulk_discount_flag: boolean | null;
  bulk_threshold: number | null;
  bulk_discount_rate: number | null;
  deductible_flag: boolean | null;
  negotiation_flag: boolean | null;
  required_cert: string | null;
};

type ReservationRow = {
  id: string;
  apartment_id: string | null;
  name: string;
  phone: string;
  address: string;
  service_type: string;
  preferred_date: string;
  preferred_time: string;
  detail: string;
  image_urls: unknown;
  priority: "normal" | "emergency";
  status: "waiting_payment" | "접수" | "진행중" | "완료";
  note: string;
  note_updated_at: string | null;
  base_fee: number;
  extra_fee: number;
  total_amount: number;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  source?: string | null;
  completed_at?: string | null;
  last_decline_reason?: string | null;
  last_declined_worker_name?: string | null;
  last_declined_at?: string | null;
  upgrade_reason?: string | null;
  upgraded_at?: string | null;
  apartments: { name: string; code: string } | { name: string; code: string }[] | null;
  tasks: TaskRow[] | TaskRow | null;
  orders?:
    | {
        payment_status: string | null;
        dispatch_status: string | null;
        prepayment_confirmed: boolean | null;
        final_payment_status: "PENDING" | "REQUESTED" | "PAID" | "FAILED" | "CANCELLED" | null;
        total_final_fee: number | null;
        warranty_issued_at: string | null;
      }
    | {
        payment_status: string | null;
        dispatch_status: string | null;
        prepayment_confirmed: boolean | null;
        final_payment_status: "PENDING" | "REQUESTED" | "PAID" | "FAILED" | "CANCELLED" | null;
        total_final_fee: number | null;
        warranty_issued_at: string | null;
      }[]
    | null;
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function workerNameFromJoin(w: TaskRow["workers"]): string | null {
  if (!w) return null;
  if (Array.isArray(w)) {
    return w[0]?.name ?? null;
  }
  return w.name ?? null;
}

function mapServiceTypeToPatentKey(serviceType: string): string {
  const value = serviceType.trim();
  if (value.includes("누전")) return "LEAKAGE";
  if (value.includes("정기") || value.includes("진단")) return "DIAGNOSIS";
  if (value.includes("콘센트") || value.includes("스위치")) return "OUTLET";
  if (value.includes("전등")) return "LIGHT";
  return "VISIT";
}

function mapServiceItem(row: ServiceItemRow): ServiceItem {
  return {
    id: row.id,
    service_type: row.service_type,
    name: row.name,
    min_fee: Number.isFinite(row.min_fee) ? Number(row.min_fee) : 0,
    max_fee: Number.isFinite(row.max_fee) ? Number(row.max_fee) : 0,
    unit_price: Number.isFinite(row.unit_price) ? Number(row.unit_price) : undefined,
    surcharge_flag: Boolean(row.surcharge_flag),
    bulk_discount_flag: Boolean(row.bulk_discount_flag),
    bulk_threshold: Number.isFinite(row.bulk_threshold) ? Number(row.bulk_threshold) : 5,
    bulk_discount_rate: Number.isFinite(row.bulk_discount_rate) ? Number(row.bulk_discount_rate) : 0,
    deductible_flag: Boolean(row.deductible_flag),
    negotiation_flag: Boolean(row.negotiation_flag)
  };
}

async function findApplicableServiceItem(params: {
  apartmentId?: string | null;
  serviceType: string;
}): Promise<(ServiceItem & { required_cert: string | null }) | null> {
  const supabase = requireSupabaseAdmin();
  const patentType = mapServiceTypeToPatentKey(params.serviceType);
  const apartmentId = params.apartmentId ?? null;
  const { data, error } = await supabase
    .from("service_items")
    .select(
      "id, service_type, name, min_fee, max_fee, unit_price, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, deductible_flag, negotiation_flag, required_cert, apt_id, display_order"
    )
    .eq("service_type", patentType)
    .or(apartmentId ? `apt_id.eq.${apartmentId},apt_id.is.null` : "apt_id.is.null")
    .order("apt_id", { ascending: false })
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`서비스 항목 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  const mapped = mapServiceItem(data as ServiceItemRow);
  return { ...mapped, required_cert: (data as ServiceItemRow).required_cert ?? null };
}

async function issueWarrantyForReservation(params: {
  reservationId: string;
  apartmentId: string;
  /** 없으면 apartments.apt_code 조회값 사용 */
  aptCode?: string;
  technicianId?: string | null;
  serviceType: string;
  serviceSummary: string;
  finalAmount: number;
  sitePhotos: string[];
}): Promise<{ warrantyId: string; warrantyNumber: string }> {
  const supabase = requireSupabaseAdmin();
  const { data: apt, error: aptErr } = await supabase.from("apartments").select("apt_code").eq("id", params.apartmentId).maybeSingle();
  if (aptErr || !apt) {
    throw new Error(`보증서 발급용 단지 조회 실패: ${aptErr?.message ?? "not found"}`);
  }

  const now = new Date();
  const aptRow = apt as { apt_code?: string | null };
  const resolvedAptCode = params.aptCode?.trim() || String(aptRow.apt_code ?? "").trim() || null;
  const warrantyNumber = buildPatentWarrantyNumber({
    issuedAt: now,
    reservationId: params.reservationId,
    aptCode: resolvedAptCode
  });
  const startDate = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 1);
  const endDateText = endDate.toISOString().slice(0, 10);
  const verifyBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://www.dkansim.com";
  const verifyUrl = `${verifyBase.replace(/\/$/, "")}/verify/${encodeURIComponent(warrantyNumber)}`;

  const { data, error } = await supabase
    .from("warranties")
    .upsert(
      {
        warranty_number: warrantyNumber,
        reservation_id: params.reservationId,
        apt_id: params.apartmentId,
        technician_id: params.technicianId ?? null,
        service_type: mapServiceTypeToPatentKey(params.serviceType),
        service_summary: params.serviceSummary,
        warranty_months: 12,
        warranty_start: startDate,
        warranty_end: endDateText,
        final_amount: params.finalAmount,
        site_photos: params.sitePhotos,
        verify_url: verifyUrl,
        status: "ISSUED"
      },
      { onConflict: "reservation_id" }
    )
    .select("id, warranty_number")
    .single();
  if (error || !data) {
    throw new Error(`보증서 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return { warrantyId: data.id, warrantyNumber: data.warranty_number };
}

function mapReservation(row: ReservationRow): Reservation {
  const tRaw = row.tasks;
  const t = Array.isArray(tRaw) ? tRaw[0] : tRaw;
  const oRaw = row.orders;
  const o = Array.isArray(oRaw) ? oRaw[0] : oRaw;
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentName: Array.isArray(row.apartments) ? row.apartments[0]?.name ?? null : row.apartments?.name ?? null,
    apartmentCode: Array.isArray(row.apartments) ? row.apartments[0]?.code ?? null : row.apartments?.code ?? null,
    name: row.name,
    phone: row.phone,
    address: row.address,
    serviceType: row.service_type,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time ?? "",
    detail: row.detail ?? "",
    imageUrls: asStringArray(row.image_urls),
    priority: row.priority,
    status: row.status,
    note: row.note ?? "",
    noteUpdatedAt: row.note_updated_at,
    baseFee: Number.isFinite(row.base_fee) ? row.base_fee : 50000,
    extraFee: Number.isFinite(row.extra_fee) ? row.extra_fee : 0,
    totalAmount: Number.isFinite(row.total_amount) ? row.total_amount : (Number.isFinite(row.base_fee) ? row.base_fee : 50000),
    isPaid: Boolean(row.is_paid),
    paidAt: row.paid_at,
    createdAt: row.created_at,
    taskId: t?.id ?? null,
    taskStatus: t?.status ?? null,
    taskAcceptedAt: t?.accepted_at ?? null,
    assignedWorkerId: t?.worker_id ?? null,
    assignedWorkerName: t ? workerNameFromJoin(t.workers) : null,
    lastDeclineReason: row.last_decline_reason ?? null,
    lastDeclinedWorkerName: row.last_declined_worker_name ?? null,
    lastDeclinedAt: row.last_declined_at ?? null,
    upgradeReason: row.upgrade_reason ?? null,
    upgradedAt: row.upgraded_at ?? null,
    orderFinalPaymentStatus: o?.final_payment_status ?? null,
    orderTotalFinalFee: Number.isFinite(o?.total_final_fee) ? Number(o?.total_final_fee) : null,
    orderWarrantyIssuedAt: o?.warranty_issued_at ?? null,
    orderPaymentStatus: o?.payment_status ?? null,
    orderDispatchStatus: o?.dispatch_status ?? null,
    orderPrepaymentConfirmed: Boolean(o?.prepayment_confirmed),
    source: (row.source as "online" | "walk_in" | "phone" | null) ?? "online",
    completedAt: row.completed_at ?? null
  };
}

export async function pgReadReservations(): Promise<Reservation[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `
      id,
      apartment_id,
      name,
      phone,
      address,
      service_type,
      preferred_date,
      preferred_time,
      detail,
      image_urls,
      priority,
      status,
      note,
      note_updated_at,
      base_fee,
      extra_fee,
      total_amount,
      is_paid,
      paid_at,
      created_at,
      source,
      completed_at,
      last_decline_reason,
      last_declined_worker_name,
      last_declined_at,
      apartments (
        name,
        code
      ),
      tasks (
        id,
        status,
        worker_id,
        accepted_at,
        workers ( name )
      ),
      orders (
        payment_status,
        dispatch_status,
        prepayment_confirmed,
        final_payment_status,
        total_final_fee,
        warranty_issued_at
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`예약 목록 조회 실패: ${error.message}`);
  }
  return (data as ReservationRow[] | null)?.map(mapReservation) ?? [];
}

export async function pgFindReservationById(id: string): Promise<Reservation | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `
      id,
      apartment_id,
      name,
      phone,
      address,
      service_type,
      preferred_date,
      preferred_time,
      detail,
      image_urls,
      priority,
      status,
      note,
      note_updated_at,
      base_fee,
      extra_fee,
      total_amount,
      is_paid,
      paid_at,
      created_at,
      source,
      completed_at,
      last_decline_reason,
      last_declined_worker_name,
      last_declined_at,
      apartments (
        name,
        code
      ),
      tasks (
        id,
        status,
        worker_id,
        accepted_at,
        workers ( name )
      ),
      orders (
        payment_status,
        dispatch_status,
        prepayment_confirmed,
        final_payment_status,
        total_final_fee,
        warranty_issued_at
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return mapReservation(data as ReservationRow);
}

/** 고객용 "내 예약 현황" — 전화번호로 본인 예약 목록 조회 (최근 20건) */
export async function pgFindReservationsByPhone(phone: string): Promise<Reservation[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `
      id,
      apartment_id,
      name,
      phone,
      address,
      service_type,
      preferred_date,
      preferred_time,
      detail,
      image_urls,
      priority,
      status,
      note,
      note_updated_at,
      base_fee,
      extra_fee,
      total_amount,
      is_paid,
      paid_at,
      created_at,
      source,
      completed_at,
      apartments (
        name,
        code
      ),
      tasks (
        id,
        status,
        worker_id,
        accepted_at,
        workers ( name )
      ),
      orders (
        payment_status,
        dispatch_status,
        prepayment_confirmed,
        final_payment_status,
        total_final_fee,
        warranty_issued_at
      )
    `
    )
    .eq("phone", phone.trim())
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`예약 조회 실패: ${error.message}`);
  }
  return (data as ReservationRow[] | null)?.map(mapReservation) ?? [];
}

export async function pgHasReservationTimeConflict(
  preferredDate: string,
  preferredTime: string,
  excludeId?: string
): Promise<boolean> {
  const supabase = requireSupabaseAdmin();
  let query = supabase
    .from("reservations")
    .select("id")
    .neq("status", "완료")
    .neq("priority", "emergency")
    .eq("preferred_date", preferredDate)
    .eq("preferred_time", preferredTime)
    .limit(1);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { data, error } = await query;

  if (error) {
    throw new Error(`예약 충돌 확인 실패: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

export async function pgCreateReservation(
  payload: Omit<
    Reservation,
    | "id"
    | "createdAt"
    | "status"
    | "note"
    | "noteUpdatedAt"
    | "priority"
    | "taskId"
    | "taskStatus"
    | "assignedWorkerId"
    | "assignedWorkerName"
    | "baseFee"
    | "extraFee"
    | "totalAmount"
    | "isPaid"
    | "paidAt"
  > & {
    priority?: Reservation["priority"];
    imageUrls?: string[];
    baseFee?: number;
  }
): Promise<Reservation> {
  const supabase = requireSupabaseAdmin();
  const baseFee =
    typeof payload.baseFee === "number" && Number.isFinite(payload.baseFee) ? Math.max(50000, Math.round(payload.baseFee)) : 50000;
  const serviceItem = await findApplicableServiceItem({
    apartmentId: payload.apartmentId ?? null,
    serviceType: payload.serviceType
  });
  const insert = {
    apartment_id: payload.apartmentId ?? null,
    service_item_id: serviceItem?.id ?? null,
    name: payload.name,
    phone: payload.phone,
    address: payload.address,
    service_type: payload.serviceType,
    preferred_date: payload.preferredDate,
    preferred_time: payload.preferredTime,
    detail: payload.detail,
    image_urls: payload.imageUrls ?? [],
    priority: payload.priority ?? "normal",
    status: "waiting_payment" as const,
    payment_status: "PENDING" as const,
    note: "",
    note_updated_at: null,
    base_fee: baseFee,
    extra_fee: 0,
    total_amount: baseFee,
    is_paid: false,
    paid_at: null,
    prepayment_confirmed: false,
    prepayment_confirmed_at: null
  };

  const { data, error } = await supabase.from("reservations").insert(insert).select().single();
  if (error || !data) {
    throw new Error(`예약 생성 실패: ${error?.message ?? "unknown"}`);
  }
  const found = await pgFindReservationById(data.id);
  if (!found) {
    throw new Error("예약 생성 후 조회에 실패했습니다.");
  }
  return found;
}

/** 전화·현장 등 오프라인 접수: 시간 충돌 검사 없음, 상태는 바로 「접수」 */
export async function pgAdminCreateOfflineReservation(
  payload: Omit<
    Reservation,
    | "id"
    | "createdAt"
    | "status"
    | "note"
    | "noteUpdatedAt"
    | "priority"
    | "taskId"
    | "taskStatus"
    | "assignedWorkerId"
    | "assignedWorkerName"
    | "baseFee"
    | "extraFee"
    | "totalAmount"
    | "isPaid"
    | "paidAt"
  > & {
    priority?: Reservation["priority"];
    imageUrls?: string[];
    baseFee?: number;
  }
): Promise<Reservation> {
  const supabase = requireSupabaseAdmin();
  const baseFee =
    typeof payload.baseFee === "number" && Number.isFinite(payload.baseFee) ? Math.max(50000, Math.round(payload.baseFee)) : 50000;
  const serviceItem = await findApplicableServiceItem({
    apartmentId: payload.apartmentId ?? null,
    serviceType: payload.serviceType
  });
  const insert = {
    apartment_id: payload.apartmentId ?? null,
    service_item_id: serviceItem?.id ?? null,
    name: payload.name,
    phone: payload.phone,
    address: payload.address,
    service_type: payload.serviceType,
    preferred_date: payload.preferredDate,
    preferred_time: payload.preferredTime,
    detail: payload.detail?.trim() || "오프라인 접수",
    image_urls: payload.imageUrls ?? [],
    priority: payload.priority ?? "normal",
    status: "접수" as const,
    payment_status: "PENDING" as const,
    note: "",
    note_updated_at: null,
    base_fee: baseFee,
    extra_fee: 0,
    total_amount: baseFee,
    is_paid: false,
    paid_at: null,
    prepayment_confirmed: false,
    prepayment_confirmed_at: null,
    // 관리자가 전화 상담 후 등록하는 접수 — source를 안 넣으면 DB default('online')로
    // 잘못 기록돼 채널별 출장비 구분이 무의미해진다(2026-07-12 발견한 기존 버그, 이번에 수정).
    source: "phone" as const
  };

  const { data, error } = await supabase.from("reservations").insert(insert).select().single();
  if (error || !data) {
    throw new Error(`오프라인 예약 생성 실패: ${error?.message ?? "unknown"}`);
  }
  const found = await pgFindReservationById(data.id);
  if (!found) {
    throw new Error("예약 생성 후 조회에 실패했습니다.");
  }
  return found;
}

export type PgDeleteReservationResult = { ok: true } | { ok: false; message: string };

export async function pgDeleteReservationById(reservationId: string): Promise<PgDeleteReservationResult> {
  const supabase = requireSupabaseAdmin();
  const { data: res, error: readErr } = await supabase
    .from("reservations")
    .select("id, status")
    .eq("id", reservationId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, message: readErr.message };
  }
  if (!res) {
    return { ok: false, message: "대상 예약을 찾을 수 없습니다." };
  }
  if (res.status === "진행중" || res.status === "완료") {
    return { ok: false, message: "진행 중이거나 완료된 예약은 삭제할 수 없습니다." };
  }

  const { data: task } = await supabase.from("tasks").select("id, status").eq("reservation_id", reservationId).maybeSingle();
  if (task?.status === "in_progress" || task?.status === "completed") {
    return { ok: false, message: "현장 작업이 진행 중이거나 완료된 예약은 삭제할 수 없습니다." };
  }

  const { data: orders } = await supabase.from("orders").select("id, final_payment_status").eq("reservation_id", reservationId);
  for (const o of orders ?? []) {
    if (o.final_payment_status === "PAID") {
      return { ok: false, message: "최종 정산이 완료된 주문이 있어 삭제할 수 없습니다." };
    }
  }

  const { error: delOrdErr } = await supabase.from("orders").delete().eq("reservation_id", reservationId);
  if (delOrdErr) {
    return { ok: false, message: `주문 삭제 실패: ${delOrdErr.message}` };
  }

  const { error: delResErr } = await supabase.from("reservations").delete().eq("id", reservationId);
  if (delResErr) {
    return { ok: false, message: `예약 삭제 실패: ${delResErr.message}` };
  }
  return { ok: true };
}

export async function pgUpdateReservation(
  id: string,
  update: Partial<
    Pick<
      Reservation,
      "status" | "note" | "noteUpdatedAt" | "isPaid" | "baseFee" | "extraFee" | "totalAmount" | "paidAt" | "preferredDate" | "preferredTime"
    >
  >
): Promise<Reservation | null> {
  const supabase = requireSupabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (update.status) patch.status = update.status;
  if (typeof update.note === "string") patch.note = update.note;
  if (update.noteUpdatedAt !== undefined) patch.note_updated_at = update.noteUpdatedAt;
  if (typeof update.isPaid === "boolean") patch.is_paid = update.isPaid;
  if (typeof update.baseFee === "number") patch.base_fee = Math.max(0, Math.round(update.baseFee));
  if (typeof update.extraFee === "number") patch.extra_fee = Math.max(0, Math.round(update.extraFee));
  if (typeof update.totalAmount === "number") patch.total_amount = Math.max(0, Math.round(update.totalAmount));
  if (update.paidAt !== undefined) patch.paid_at = update.paidAt;
  if (typeof update.preferredDate === "string") patch.preferred_date = update.preferredDate;
  if (typeof update.preferredTime === "string") patch.preferred_time = update.preferredTime;

  if (Object.keys(patch).length === 0) {
    return null;
  }

  const { error } = await supabase.from("reservations").update(patch).eq("id", id);
  if (error) {
    throw new Error(`예약 수정 실패: ${error.message}`);
  }
  return pgFindReservationById(id);
}

export type PgRestoreResult = {
  updated: number;
  skippedNotFound: number;
  errors: { id: string; error: string }[];
};

/**
 * 백업 스냅샷의 핵심 필드만 실제 reservations 테이블에 되돌린다.
 *
 * 되돌리지 않는 것: taskId/taskStatus/assignedWorker 관련 및 order 관련 필드 — 이건 reservations
 * 테이블 컬럼이 아니라 tasks/orders 테이블을 join해서 만드는 값이라, 여기서 단순 UPDATE로는
 * 복원할 수 없다(운영 공백 점검 9번 — restore가 실제로는 아무 데이터도 안 건드리던 버그를
 * 고치며 의도적으로 스코프를 좁힘. 여러 테이블에 걸친 트랜잭션 복원은 더 큰 별도 작업).
 *
 * id가 지금 테이블에 없는 행(그 사이 삭제된 예약)은 되살리지 않고 skippedNotFound로만 센다 —
 * 무작정 INSERT하면 tasks/orders 등 다른 테이블과의 관계가 깨질 수 있어서 안전하게 스킵한다.
 */
export async function pgBulkRestoreReservationCore(
  snapshot: Array<Partial<Reservation> & { id: string }>,
): Promise<PgRestoreResult> {
  const supabase = requireSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase.from("reservations").select("id");
  if (existingError) throw new Error(`복원 대상 조회 실패: ${existingError.message}`);
  const existingIds = new Set((existing ?? []).map((row) => row.id as string));

  let updated = 0;
  let skippedNotFound = 0;
  const errors: { id: string; error: string }[] = [];

  for (const item of snapshot) {
    if (!item.id || !existingIds.has(item.id)) {
      skippedNotFound++;
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (item.apartmentId !== undefined) patch.apartment_id = item.apartmentId;
    if (typeof item.name === "string") patch.name = item.name;
    if (typeof item.phone === "string") patch.phone = item.phone;
    if (typeof item.address === "string") patch.address = item.address;
    if (typeof item.serviceType === "string") patch.service_type = item.serviceType;
    if (typeof item.preferredDate === "string") patch.preferred_date = item.preferredDate;
    if (typeof item.preferredTime === "string") patch.preferred_time = item.preferredTime;
    if (typeof item.detail === "string") patch.detail = item.detail;
    if (Array.isArray(item.imageUrls)) patch.image_urls = item.imageUrls;
    if (item.priority) patch.priority = item.priority;
    if (item.status) patch.status = item.status;
    if (typeof item.note === "string") patch.note = item.note;
    if (item.noteUpdatedAt !== undefined) patch.note_updated_at = item.noteUpdatedAt;
    if (typeof item.baseFee === "number") patch.base_fee = Math.max(0, Math.round(item.baseFee));
    if (typeof item.extraFee === "number") patch.extra_fee = Math.max(0, Math.round(item.extraFee));
    if (typeof item.totalAmount === "number") patch.total_amount = Math.max(0, Math.round(item.totalAmount));
    if (typeof item.isPaid === "boolean") patch.is_paid = item.isPaid;
    if (item.paidAt !== undefined) patch.paid_at = item.paidAt;
    if (item.source) patch.source = item.source;
    if (item.completedAt !== undefined) patch.completed_at = item.completedAt;

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase.from("reservations").update(patch).eq("id", item.id);
    if (error) {
      errors.push({ id: item.id, error: error.message });
      continue;
    }
    updated++;
  }

  return { updated, skippedNotFound, errors };
}

export type WorkerPublic = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
};

export async function pgListWorkers(): Promise<WorkerPublic[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("workers")
    .select("id, name, phone, active, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`기사 목록 실패: ${error.message}`);
  }
  return (
    data?.map((w) => ({
      id: w.id,
      name: w.name,
      phone: w.phone,
      active: w.active,
      createdAt: w.created_at
    })) ?? []
  );
}

export async function pgGetReservationContact(
  reservationId: string
): Promise<{ name: string; phone: string; landlordPhone: string | null } | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select("name, phone, landlord_phone")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) {
    throw new Error(`예약 연락처 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return { name: data.name, phone: data.phone, landlordPhone: data.landlord_phone };
}

export async function pgCreateWorker(input: { name: string; phone: string; pinHash: string }): Promise<WorkerPublic> {
  const supabase = requireSupabaseAdmin();
  const name = input.name.trim();
  const phone = input.phone.trim();

  // workers.phone에 unique index(workers_phone_lower_idx)가 있어, ERP(/admin/erp/workers)에서
  // PIN 없이(pin_hash="") 먼저 등록된 기사를 여기서 다시 등록하면 그냥 실패했었다(23505 unique
  // violation을 그대로 노출) — 실제로는 "이미 있는 사람에게 PIN을 새로 발급"하려는 의도이므로,
  // 같은 번호가 있으면 PIN/이름만 갱신(재발급)하고, 없을 때만 새로 만든다.
  const { data: existing, error: findErr } = await supabase
    .from("workers")
    .select("id")
    .ilike("phone", phone)
    .maybeSingle();
  if (findErr) {
    throw new Error(`기사 조회 실패: ${findErr.message}`);
  }

  if (existing) {
    const { data, error } = await supabase
      .from("workers")
      .update({ name, pin_hash: input.pinHash, active: true })
      .eq("id", existing.id)
      .select("id, name, phone, active, created_at")
      .single();
    if (error || !data) {
      throw new Error(`기사 PIN 재발급 실패: ${error?.message ?? "unknown"}`);
    }
    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      active: data.active,
      createdAt: data.created_at
    };
  }

  const { data, error } = await supabase
    .from("workers")
    .insert({
      name,
      phone,
      pin_hash: input.pinHash,
      active: true
    })
    .select("id, name, phone, active, created_at")
    .single();
  if (error || !data) {
    throw new Error(`기사 등록 실패: ${error?.message ?? "unknown"}`);
  }
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    active: data.active,
    createdAt: data.created_at
  };
}

export async function pgGetWorkerById(workerId: string): Promise<{ id: string; name: string } | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("workers").select("id, name").eq("id", workerId).maybeSingle();
  if (error) {
    throw new Error(`기사 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return { id: data.id, name: data.name };
}

export async function pgFindWorkerByPhone(phone: string): Promise<{ id: string; pin_hash: string; active: boolean } | null> {
  const supabase = requireSupabaseAdmin();
  const normalized = phone.trim();
  const { data, error } = await supabase.from("workers").select("id, pin_hash, active").eq("phone", normalized).maybeSingle();
  if (error) {
    throw new Error(`기사 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return { id: data.id, pin_hash: data.pin_hash, active: data.active };
}

export async function pgGetWorkerAssignmentContext(
  reservationId: string,
  workerId: string
): Promise<{ scheduledAt: string; existingAssignments: { scheduledAt: string; customerName: string }[] }> {
  const supabase = requireSupabaseAdmin();

  const { data: reservation, error: rErr } = await supabase
    .from("reservations")
    .select("preferred_date, preferred_time")
    .eq("id", reservationId)
    .maybeSingle();
  if (rErr || !reservation) {
    throw new Error(`예약 조회 실패: ${rErr?.message ?? "not found"}`);
  }
  const scheduledAt = `${reservation.preferred_date}T${(reservation.preferred_time || "09:00").padStart(5, "0")}:00+09:00`;

  const { data: existing, error: eErr } = await supabase
    .from("tasks")
    .select("reservation_id, reservations(preferred_date, preferred_time, name)")
    .eq("worker_id", workerId)
    .neq("status", "completed");
  if (eErr) {
    throw new Error(`기존 배정 조회 실패: ${eErr.message}`);
  }

  type ExistingTaskRow = {
    reservations: { preferred_date: string; preferred_time: string | null; name: string } | { preferred_date: string; preferred_time: string | null; name: string }[] | null;
  };
  const existingAssignments = ((existing ?? []) as ExistingTaskRow[])
    .map((row) => {
      const res = Array.isArray(row.reservations) ? row.reservations[0] : row.reservations;
      if (!res?.preferred_date) return null;
      return {
        scheduledAt: `${res.preferred_date}T${(res.preferred_time || "09:00").padStart(5, "0")}:00+09:00`,
        customerName: res.name ?? ""
      };
    })
    .filter((v): v is { scheduledAt: string; customerName: string } => v !== null);

  return { scheduledAt, existingAssignments };
}

export async function pgAssignTask(reservationId: string, workerId: string): Promise<Reservation> {
  const supabase = requireSupabaseAdmin();

  const { data: reservation, error: readErr } = await supabase
    .from("reservations")
    .select("id, is_paid, prepayment_confirmed, apartment_id, service_item_id, service_type")
    .eq("id", reservationId)
    .maybeSingle();
  if (readErr || !reservation) {
    throw new Error(`예약 조회 실패: ${readErr?.message ?? "not found"}`);
  }
  if (!reservation.is_paid || !reservation.prepayment_confirmed) {
    throw new Error("미입금 예약은 기사 배정할 수 없습니다. 입금완료 처리 후 배정해주세요.");
  }

  const requiredItem =
    reservation.service_item_id
      ? await supabase.from("service_items").select("required_cert").eq("id", reservation.service_item_id).maybeSingle()
      : { data: null, error: null };
  if (requiredItem.error) {
    throw new Error(`서비스 자격 조건 조회 실패: ${requiredItem.error.message}`);
  }
  const requiredCert = requiredItem.data?.required_cert ?? null;
  const { data: worker, error: workerErr } = await supabase
    .from("workers")
    .select("id, name, active, certifications")
    .eq("id", workerId)
    .maybeSingle();
  if (workerErr || !worker || !worker.active) {
    throw new Error(`기사 조회 실패: ${workerErr?.message ?? "worker not active"}`);
  }
  if (requiredCert) {
    const certifications = Array.isArray(worker.certifications) ? (worker.certifications as string[]) : [];
    const matched = match_technician(
      [{ id: worker.id, name: worker.name, certifications, is_available: true }],
      requiredCert
    );
    if (!matched) {
      throw new Error(`해당 작업은 '${requiredCert}' 자격 기사에게만 배정할 수 있습니다.`);
    }
  }

  const { error: rErr } = await supabase
    .from("reservations")
    .update({
      status: "진행중",
      payment_status: "ASSIGNED",
      technician_id: workerId,
      last_decline_reason: null,
      last_declined_worker_name: null,
      last_declined_at: null
    })
    .eq("id", reservationId);
  if (rErr) {
    throw new Error(`예약 상태 갱신 실패: ${rErr.message}`);
  }

  const { data: existing, error: exErr } = await supabase.from("tasks").select("id").eq("reservation_id", reservationId).maybeSingle();
  if (exErr) {
    throw new Error(`작업 조회 실패: ${exErr.message}`);
  }

  const nowIso = new Date().toISOString();
  const taskPayload = {
    reservation_id: reservationId,
    worker_id: workerId,
    status: "assigned" as const,
    started_at: null as string | null,
    completed_at: null as string | null,
    site_photo_urls: [] as string[],
    signature_png: null as string | null,
    accepted_at: null as string | null,
    declined_at: null as string | null,
    decline_reason: null as string | null,
    updated_at: nowIso
  };

  if (existing?.id) {
    const { error: uErr } = await supabase.from("tasks").update(taskPayload).eq("id", existing.id);
    if (uErr) {
      throw new Error(`작업 배정 갱신 실패: ${uErr.message}`);
    }
  } else {
    const { error: iErr } = await supabase.from("tasks").insert(taskPayload);
    if (iErr) {
      throw new Error(`작업 배정 실패: ${iErr.message}`);
    }
  }

  const found = await pgFindReservationById(reservationId);
  if (!found) {
    throw new Error("배정 후 예약을 찾을 수 없습니다.");
  }
  return found;
}

export async function pgGetTaskForWorker(
  taskId: string,
  workerId: string
): Promise<{
  task: {
    id: string;
    status: string;
    reservation_id: string;
    site_photo_urls: string[];
    signature_png: string | null;
    accepted_at: string | null;
  };
  reservation: Reservation;
} | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      id,
      status,
      reservation_id,
      worker_id,
      site_photo_urls,
      signature_png,
      accepted_at,
      reservations (
        id,
        apartment_id,
        name,
        phone,
        address,
        service_type,
        preferred_date,
        preferred_time,
        detail,
        image_urls,
        priority,
        status,
        note,
        note_updated_at,
        base_fee,
        extra_fee,
        total_amount,
        is_paid,
        paid_at,
        created_at,
        upgrade_reason,
        upgraded_at,
        apartments (
          name,
          code
        ),
        orders (
          payment_status,
          dispatch_status,
          prepayment_confirmed,
          final_payment_status,
          total_final_fee,
          warranty_issued_at
        )
      )
    `
    )
    .eq("id", taskId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  if (data.worker_id !== workerId) {
    return null;
  }
  const resRaw = data.reservations as unknown as ReservationRow | ReservationRow[] | null;
  const res = Array.isArray(resRaw) ? resRaw[0] : resRaw;
  if (!res) return null;
  const reservation = mapReservation({ ...res, tasks: [] });
  return {
    task: {
      id: data.id,
      status: data.status,
      reservation_id: data.reservation_id,
      site_photo_urls: asStringArray(data.site_photo_urls),
      signature_png: data.signature_png,
      accepted_at: data.accepted_at ?? null
    },
    reservation
  };
}

export async function pgListTasksForWorker(workerId: string): Promise<
  Array<{
    task: { id: string; status: string; site_photo_urls: string[]; accepted_at: string | null };
    reservation: Reservation;
  }>
> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      id,
      status,
      site_photo_urls,
      accepted_at,
      reservations (
        id,
        apartment_id,
        name,
        phone,
        address,
        service_type,
        preferred_date,
        preferred_time,
        detail,
        image_urls,
        priority,
        status,
        note,
        note_updated_at,
        base_fee,
        extra_fee,
        total_amount,
        is_paid,
        paid_at,
        created_at,
        upgrade_reason,
        upgraded_at,
        apartments (
          name,
          code
        )
      )
    `
    )
    .eq("worker_id", workerId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`작업 목록 실패: ${error.message}`);
  }

  if (!data) {
    return [];
  }
  return data
    .map((row) => {
      const resRaw = row.reservations as unknown as ReservationRow | ReservationRow[] | null;
      const res = Array.isArray(resRaw) ? resRaw[0] : resRaw;
      if (!res) {
        return null;
      }
      return {
        task: {
          id: row.id,
          status: row.status,
          site_photo_urls: asStringArray(row.site_photo_urls),
          accepted_at: row.accepted_at ?? null
        },
        reservation: mapReservation({ ...res, tasks: [] })
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function pgStartTask(taskId: string, workerId: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, worker_id, status, reservation_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data || data.worker_id !== workerId) {
    throw new Error("작업을 찾을 수 없거나 권한이 없습니다.");
  }
  if (data.status === "completed") {
    throw new Error("이미 완료된 작업입니다.");
  }
  const { error: uErr } = await supabase
    .from("tasks")
    .update({ status: "in_progress", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (uErr) {
    throw new Error(`작업 시작 처리 실패: ${uErr.message}`);
  }
  const { error: rErr } = await supabase
    .from("reservations")
    .update({ payment_status: "IN_PROGRESS" })
    .eq("id", data.reservation_id);
  if (rErr) {
    throw new Error(`예약 진행 상태 반영 실패: ${rErr.message}`);
  }
}

/**
 * 단순 기구교체 현장에서 더 큰 문제가 발견돼 상/중/하 작업비 표로 넘어가는 업그레이드를 기록한다.
 * 정산 시 별도 계산 로직이 필요하지 않다 — calculate_final_fee()의 기존 deductible_flag 폴백이
 * work_proceeded && extra_fee>0일 때 이미 base_fee(단순교체 공임)를 자동 공제해주기 때문에,
 * 기사가 완료 시 입력하는 extraFee(작업비 난이도 정액)만 정확히 반영되면 된다.
 */
export async function pgUpgradeSimpleSwapTask(taskId: string, workerId: string, reason: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, worker_id, status, reservation_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data || data.worker_id !== workerId) {
    throw new Error("작업을 찾을 수 없거나 권한이 없습니다.");
  }
  if (data.status === "completed") {
    throw new Error("이미 완료된 작업은 업그레이드할 수 없습니다.");
  }
  const { error: rErr } = await supabase
    .from("reservations")
    .update({ upgrade_reason: reason, upgraded_at: new Date().toISOString() })
    .eq("id", data.reservation_id);
  if (rErr) {
    throw new Error(`업그레이드 기록 실패: ${rErr.message}`);
  }
}

export async function pgAppendTaskPhotos(taskId: string, workerId: string, urls: string[]): Promise<string[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("tasks").select("id, worker_id, site_photo_urls").eq("id", taskId).maybeSingle();
  if (error || !data || data.worker_id !== workerId) {
    throw new Error("작업을 찾을 수 없거나 권한이 없습니다.");
  }
  const prev = asStringArray(data.site_photo_urls);
  const next = [...prev, ...urls].slice(0, 12);
  const { error: uErr } = await supabase
    .from("tasks")
    .update({ site_photo_urls: next, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (uErr) {
    throw new Error(`사진 저장 실패: ${uErr.message}`);
  }
  return next;
}

export type TaskCompletionBreakdown = {
  materials?: { id: string; name: string; qty: number; unitPrice: number }[];
  laborTier?: { label: string; amount: number } | null;
};

export async function pgCompleteTask(
  taskId: string,
  workerId: string,
  signaturePng: string,
  extraFeeInput?: number,
  breakdownInput?: TaskCompletionBreakdown
): Promise<void> {
  const supabase = requireSupabaseAdmin();
  if (!signaturePng || signaturePng.length < 50) {
    throw new Error("완료 서명이 필요합니다.");
  }
  const { data, error } = await supabase
    .from("tasks")
    .select("id, worker_id, status, reservation_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data || data.worker_id !== workerId) {
    throw new Error("작업을 찾을 수 없거나 권한이 없습니다.");
  }
  if (data.status === "completed") {
    return;
  }
  const now = new Date().toISOString();
  const extraFee = typeof extraFeeInput === "number" && Number.isFinite(extraFeeInput) ? Math.max(0, Math.round(extraFeeInput)) : 0;
  const { error: tErr } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: now,
      signature_png: signaturePng,
      updated_at: now
    })
    .eq("id", taskId);
  if (tErr) {
    throw new Error(`작업 완료 처리 실패: ${tErr.message}`);
  }
  const { data: reservationRow, error: reservationReadErr } = await supabase
    .from("reservations")
    .select("base_fee, apartment_id, service_item_id, service_type, detail, image_urls")
    .eq("id", data.reservation_id)
    .maybeSingle();
  if (reservationReadErr || !reservationRow) {
    throw new Error(`예약 조회 실패: ${reservationReadErr?.message ?? "not found"}`);
  }
  const baseFee = Number.isFinite(reservationRow.base_fee) ? Number(reservationRow.base_fee) : 50000;
  let serviceItem = null as (ServiceItem & { required_cert: string | null }) | null;
  if (reservationRow.service_item_id) {
    const { data: itemById, error: itemByIdErr } = await supabase
      .from("service_items")
      .select(
        "id, service_type, name, min_fee, max_fee, unit_price, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, deductible_flag, negotiation_flag, required_cert"
      )
      .eq("id", reservationRow.service_item_id)
      .maybeSingle();
    if (itemByIdErr) {
      throw new Error(`서비스 항목 조회 실패: ${itemByIdErr.message}`);
    }
    if (itemById) {
      serviceItem = { ...mapServiceItem(itemById as ServiceItemRow), required_cert: (itemById as ServiceItemRow).required_cert ?? null };
    }
  }
  if (!serviceItem) {
    serviceItem = await findApplicableServiceItem({
      apartmentId: reservationRow.apartment_id,
      serviceType: reservationRow.service_type ?? "VISIT"
    });
  }
  const fallbackServiceItem: ServiceItem = {
    id: "fallback",
    service_type: "VISIT",
    name: "기본 출장비",
    min_fee: 50000,
    max_fee: 50000,
    surcharge_flag: false,
    bulk_discount_flag: false,
    bulk_threshold: 5,
    bulk_discount_rate: 0,
    deductible_flag: true,
    negotiation_flag: false
  };
  const finalFee = calculate_final_fee({
    base_fee: baseFee,
    extra_fee: extraFee,
    service_item: serviceItem ?? fallbackServiceItem,
    work_proceeded: true
  });
  const warrantySummary = `${reservationRow.detail ?? reservationRow.service_type ?? "현장 작업"} / ${finalFee.breakdown.join(" | ")}`;
  const sitePhotos = asStringArray(reservationRow.image_urls);
  const additionalDueAmount = Math.max(0, finalFee.total_fee - baseFee);
  const shouldAutoIssueWarranty = additionalDueAmount === 0;
  let warrantyId: string | null = null;
  if (reservationRow.apartment_id && shouldAutoIssueWarranty) {
    const issued = await issueWarrantyForReservation({
      reservationId: data.reservation_id,
      apartmentId: reservationRow.apartment_id,
      technicianId: workerId,
      serviceType: reservationRow.service_type ?? "VISIT",
      serviceSummary: warrantySummary,
      finalAmount: finalFee.total_fee,
      sitePhotos
    });
    warrantyId = issued.warrantyId;
  }
  const { error: rErr } = await supabase
    .from("reservations")
    .update({
      status: "완료",
      payment_status: shouldAutoIssueWarranty ? "SETTLED" : "CONFIRMING",
      extra_fee: finalFee.extra_fee,
      extra_fee_note: extraFee > 0 ? "현장 추가 비용 입력" : null,
      extra_fee_added_at: extraFee > 0 ? now : null,
      deductible_applied: finalFee.deductible_applied,
      deductible_amount: finalFee.deductible_amount,
      total_amount: finalFee.total_fee,
      settled_at: now,
      warranty_id: warrantyId,
      warranty_status: warrantyId ? "ISSUED" : "PENDING"
    })
    .eq("id", data.reservation_id);
  if (rErr) {
    throw new Error(`예약 완료 반영 실패: ${rErr.message}`);
  }

  // orders 확장 필드 동기화: 정산/보증서 상태 반영
  const orderPatch: Record<string, unknown> = {
    extra_fee_details: {
      extraFeeInput: extraFee,
      normalizedExtraFee: finalFee.extra_fee,
      additionalDueAmount,
      deductibleApplied: finalFee.deductible_applied,
      deductibleAmount: finalFee.deductible_amount,
      bulkDiscountApplied: finalFee.bulk_discount_applied,
      bulkDiscountAmount: finalFee.bulk_discount_amount,
      breakdown: finalFee.breakdown,
      materials: breakdownInput?.materials ?? [],
      laborTier: breakdownInput?.laborTier ?? null
    },
    total_final_fee: finalFee.total_fee,
    final_payment_status: shouldAutoIssueWarranty ? "PAID" : "REQUESTED",
    updated_at: now
  };

  if (warrantyId) {
    orderPatch.warranty_issued_at = now;
  }

  const { error: orderSyncErr } = await supabase.from("orders").update(orderPatch).eq("reservation_id", data.reservation_id);
  if (orderSyncErr) {
    throw new Error(`정산 완료 주문 동기화 실패: ${orderSyncErr.message}`);
  }
}

export async function pgSetReservationPayment(
  id: string,
  isPaid: boolean,
  options?: { prepaymentTxId?: string; paidAmount?: number }
): Promise<Reservation | null> {
  const supabase = requireSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: current, error: readErr } = await supabase
    .from("reservations")
    .select("status, base_fee")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !current) {
    throw new Error(`예약 조회 실패: ${readErr?.message ?? "not found"}`);
  }

  const txId = options?.prepaymentTxId?.trim() || `MANUAL-${Date.now()}`;
  const paidAmount =
    typeof options?.paidAmount === "number" && Number.isFinite(options.paidAmount)
      ? Math.max(0, Math.round(options.paidAmount))
      : Number(current.base_fee ?? 0);
  const activation = isPaid
    ? activate_assignment({
        order_id: id,
        prepayment_tx_id: txId,
        paid_amount: paidAmount,
        base_fee: Number(current.base_fee ?? 0)
      })
    : { activated: false, prepayment_confirmed: false, timestamp: new Date(), reason: "미입금 상태" };
  if (isPaid && !activation.activated) {
    throw new Error(activation.reason ?? "예약금 결제 확인 실패");
  }

  const nextStatus: Reservation["status"] =
    isPaid && current.status === "waiting_payment"
      ? "접수"
      : !isPaid && current.status !== "완료"
        ? "waiting_payment"
        : (current.status as Reservation["status"]);

  const { error } = await supabase
    .from("reservations")
    .update({
      is_paid: isPaid,
      paid_at: isPaid ? now : null,
      status: nextStatus,
      prepayment_confirmed: isPaid ? activation.prepayment_confirmed : false,
      prepayment_confirmed_at: isPaid ? activation.timestamp.toISOString() : null,
      prepayment_tx_id: isPaid ? txId : null,
      payment_status: isPaid ? "PREPAID" : "PENDING"
    })
    .eq("id", id);
  if (error) {
    throw new Error(`입금 상태 수정 실패: ${error.message}`);
  }
  return pgFindReservationById(id);
}

export async function pgUnassignTask(reservationId: string): Promise<Reservation | null> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from("tasks").delete().eq("reservation_id", reservationId);
  if (error) {
    throw new Error(`배정 해제 실패: ${error.message}`);
  }
  const { error: rErr } = await supabase
    .from("reservations")
    .update({ status: "접수", payment_status: "PREPAID", technician_id: null })
    .eq("id", reservationId);
  if (rErr) {
    throw new Error(`예약 상태 복구 실패: ${rErr.message}`);
  }
  return pgFindReservationById(reservationId);
}

/** 기사가 배정을 수락 — 본인 소유·아직 시작 전(assigned) 작업만 가능, 이미 수락했으면 조용히 무시(멱등) */
export async function pgAcceptTask(taskId: string, workerId: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, worker_id, status, accepted_at")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data || data.worker_id !== workerId) {
    throw new Error("작업을 찾을 수 없거나 권한이 없습니다.");
  }
  if (data.status !== "assigned") {
    throw new Error("이미 시작되었거나 완료된 작업입니다.");
  }
  if (data.accepted_at) {
    return;
  }
  const { error: uErr } = await supabase
    .from("tasks")
    .update({ accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (uErr) {
    throw new Error(`수락 처리 실패: ${uErr.message}`);
  }
}

/**
 * 기사가 배정을 거절 — 본인 소유·아직 시작 전(assigned) 작업만 가능(수락 여부 무관, 현장
 * 출발 전이면 마음이 바뀌어도 거절 가능해야 재배정이 빨라진다). pgUnassignTask와 동일하게
 * tasks 행을 삭제하고 예약을 「접수」로 되돌린 뒤, reservations에 거절 이력(누가/언제/왜)을
 * 남겨 관리자 배정 화면에서 즉시 눈에 띄게 한다.
 */
export async function pgDeclineTask(
  taskId: string,
  workerId: string,
  reason: string
): Promise<{ reservation: Reservation; workerName: string }> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, worker_id, status, reservation_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data || data.worker_id !== workerId) {
    throw new Error("작업을 찾을 수 없거나 권한이 없습니다.");
  }
  if (data.status !== "assigned") {
    throw new Error("이미 시작되었거나 완료된 작업은 거절할 수 없습니다.");
  }

  const worker = await pgGetWorkerById(workerId);
  const workerName = worker?.name ?? "담당 기사";

  const reservation = await pgUnassignTask(data.reservation_id);
  if (!reservation) {
    throw new Error("거절 처리 후 예약을 찾을 수 없습니다.");
  }

  const { error: declineErr } = await supabase
    .from("reservations")
    .update({
      last_decline_reason: reason,
      last_declined_worker_name: workerName,
      last_declined_at: new Date().toISOString()
    })
    .eq("id", data.reservation_id);
  if (declineErr) {
    throw new Error(`거절 이력 기록 실패: ${declineErr.message}`);
  }

  return { reservation: { ...reservation, lastDeclineReason: reason, lastDeclinedWorkerName: workerName }, workerName };
}

// ─── 현장 즉시접수(walk-in) ───────────────────────────────────────────────────

export async function pgCreateWalkInReservation(payload: {
  name: string;
  phone: string;
  address: string;
  serviceType: string;
  workDate: string;
  workTime: string;
  detail: string;
  imageUrls: string[];
  totalAmount: number;
}): Promise<Reservation> {
  const supabase = requireSupabaseAdmin();
  const now = new Date().toISOString();
  const insert = {
    apartment_id: null,
    name: payload.name,
    phone: payload.phone,
    address: payload.address,
    service_type: payload.serviceType,
    preferred_date: payload.workDate,
    preferred_time: payload.workTime,
    detail: payload.detail,
    image_urls: payload.imageUrls,
    priority: "normal" as const,
    status: "접수" as const,
    note: "",
    note_updated_at: null,
    base_fee: 0,
    extra_fee: 0,
    total_amount: payload.totalAmount,
    is_paid: true,
    paid_at: now,
    source: "walk_in"
  };
  const { data, error } = await supabase.from("reservations").insert(insert).select(`
    id, apartment_id, name, phone, address, service_type, preferred_date, preferred_time,
    detail, image_urls, priority, status, note, note_updated_at,
    base_fee, extra_fee, total_amount, is_paid, paid_at, created_at, source, completed_at,
    apartments(name,code), tasks(id,status,worker_id,accepted_at,workers(name)),
    orders(payment_status,dispatch_status,prepayment_confirmed,final_payment_status,total_final_fee,warranty_issued_at)
  `).single();
  if (error || !data) throw new Error(`현장 즉시접수 생성 실패: ${error?.message ?? "unknown"}`);
  return mapReservation(data as ReservationRow);
}

export async function issueWalkInWarranty(params: {
  reservationId: string;
  serviceType: string;
  serviceSummary: string;
  finalAmount: number;
  sitePhotos: string[];
}): Promise<{ warrantyId: string; warrantyNumber: string; verifyUrl: string }> {
  const supabase = requireSupabaseAdmin();
  const now = new Date();
  const warrantyNumber = buildPatentWarrantyNumber({
    issuedAt: now,
    reservationId: params.reservationId,
    aptCode: "WALK"
  });
  const startDate = now.toISOString().slice(0, 10);
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + 1);
  const verifyBase = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://dkansim.com").replace(/\/$/, "");
  const verifyUrl = `${verifyBase}/verify/${encodeURIComponent(warrantyNumber)}`;

  const { data, error } = await supabase
    .from("warranties")
    .upsert(
      {
        warranty_number: warrantyNumber,
        reservation_id: params.reservationId,
        apt_id: null,
        technician_id: null,
        service_type: mapServiceTypeToPatentKey(params.serviceType),
        service_summary: params.serviceSummary,
        warranty_months: 12,
        warranty_start: startDate,
        warranty_end: endDate.toISOString().slice(0, 10),
        final_amount: params.finalAmount,
        site_photos: params.sitePhotos,
        verify_url: verifyUrl,
        status: "ISSUED"
      },
      { onConflict: "reservation_id" }
    )
    .select("id, warranty_number")
    .single();
  if (error || !data) throw new Error(`보증서 저장 실패: ${error?.message ?? "unknown"}`);
  return { warrantyId: data.id, warrantyNumber: data.warranty_number, verifyUrl };
}

export async function pgCompleteWalkInReservation(reservationId: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("reservations")
    .update({ status: "완료", completed_at: new Date().toISOString() })
    .eq("id", reservationId);
  if (error) throw new Error(`완료 처리 실패: ${error.message}`);
}

export async function pgReadWalkInReservations(): Promise<Reservation[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(`
      id, apartment_id, name, phone, address, service_type, preferred_date, preferred_time,
      detail, image_urls, priority, status, note, note_updated_at,
      base_fee, extra_fee, total_amount, is_paid, paid_at, created_at, source, completed_at,
      apartments(name,code), tasks(id,status,worker_id,accepted_at,workers(name)),
      orders(payment_status,dispatch_status,prepayment_confirmed,final_payment_status,total_final_fee,warranty_issued_at)
    `)
    .eq("source", "walk_in")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`현장 기록 조회 실패: ${error.message}`);
  return (data as ReservationRow[] | null)?.map(mapReservation) ?? [];
}

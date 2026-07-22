import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import { computeAdditionalDueAmount } from "@/lib/orders-pg";

/** RSC → 클라이언트 전달 시 Flight/JSON에서 깨질 수 있는 문자 제거·치환 */
function safeClientText(value: string | null | undefined, maxLen: number): string {
  if (value == null) return "";
  let s = String(value);
  s = s.replace(/\\/g, "/");
  s = s.replace(/"/g, "″");
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g, " ");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function safeClientTextOrNull(value: string | null | undefined, maxLen: number): string | null {
  if (value == null) return null;
  const s = safeClientText(value, maxLen);
  return s.length === 0 ? null : s;
}

function safeFee(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function squash(s: string): string {
  return s.replaceAll(/\s+/g, "").toLowerCase();
}

/**
 * 가상계좌 예금주 필드에 동·호·주소 일부만 넣는 PG/자동화 값이 오면
 * 「주소·단지」 열과 중복되어 입금/배정 열이 지저분해지므로 표시용으로는 제외합니다.
 */
function virtualAccountHolderForDisplay(
  holderRaw: string | null | undefined,
  address: string,
  apartmentName: string | null
): string | null {
  const holder = safeClientTextOrNull(holderRaw, 120);
  if (!holder) return null;
  const blob = squash(`${address} ${apartmentName ?? ""}`);
  const h = squash(holder);
  if (h.length < 2) return null;
  if (blob.includes(h)) return null;
  if (h.includes("동") && h.includes("호") && /^\d{0,4}동\d{0,4}호$/.test(h.replaceAll(/[^\d동호]/g, ""))) {
    return null;
  }
  const onlyUnit = holder.replaceAll(/\s+/g, "").match(/^(\d+)동(\d+)호$/);
  if (onlyUnit && blob.includes(`${onlyUnit[1]}동${onlyUnit[2]}호`)) return null;
  return holder;
}

/** 접수(예약) 기준으로 주문·배정·정산·보증까지 한눈에 보기 위한 행 */
export type AdminCustomerCareRow = {
  reservationId: string;
  name: string;
  phone: string;
  address: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  detail: string;
  priority: string;
  status: string;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
  apartmentName: string | null;
  apartmentCode: string | null;
  taskId: string | null;
  taskStatus: string | null;
  assignedWorkerName: string | null;
  orderId: string | null;
  orderPaymentStatus: string | null;
  orderDispatchStatus: string | null;
  orderFinalPaymentStatus: string | null;
  orderTotalFinalFee: number | null;
  /** 이미 결제된 출장비를 제외하고 이번에 추가로 받아야 할 금액 */
  orderAdditionalDueAmount: number;
  orderWarrantyIssuedAt: string | null;
  virtualAccountNumber: string | null;
  virtualAccountHolder: string | null;
};

type TaskJoin = {
  id: string;
  status: string;
  worker_id: string | null;
  workers: { name: string } | { name: string }[] | null;
};

type OrderJoin = {
  id: string;
  payment_status: string | null;
  dispatch_status: string | null;
  final_payment_status: string | null;
  base_fee: number | null;
  total_final_fee: number | null;
  extra_fee_details: unknown;
  warranty_issued_at: string | null;
  virtual_account_number: string | null;
  virtual_account_holder: string | null;
};

type CareRow = {
  id: string;
  apartment_id: string | null;
  name: string;
  phone: string;
  address: string;
  service_type: string;
  preferred_date: string;
  preferred_time: string;
  detail: string;
  priority: string;
  status: string;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  apartments: { name: string; code: string } | { name: string; code: string }[] | null;
  tasks: TaskJoin[] | TaskJoin | null;
  orders: OrderJoin[] | OrderJoin | null;
};

function workerName(w: TaskJoin["workers"]): string | null {
  if (!w) return null;
  if (Array.isArray(w)) return w[0]?.name ?? null;
  return w.name ?? null;
}

function firstTask(t: CareRow["tasks"]): TaskJoin | null {
  if (!t) return null;
  return Array.isArray(t) ? t[0] ?? null : t;
}

function firstOrder(o: CareRow["orders"]): OrderJoin | null {
  if (!o) return null;
  return Array.isArray(o) ? o[0] ?? null : o;
}

function mapCareRow(row: CareRow): AdminCustomerCareRow {
  const apt = row.apartments;
  const apartmentNameRaw = Array.isArray(apt) ? apt[0]?.name ?? null : apt?.name ?? null;
  const apartmentCodeRaw = Array.isArray(apt) ? apt[0]?.code ?? null : apt?.code ?? null;
  const t = firstTask(row.tasks);
  const ord = firstOrder(row.orders);
  const addressText = safeClientText(row.address, 200);
  const apartmentNameForHolder = safeClientTextOrNull(apartmentNameRaw, 120);
  return {
    reservationId: safeClientText(row.id, 64),
    name: safeClientText(row.name, 80),
    phone: safeClientText(row.phone, 32),
    address: addressText,
    serviceType: safeClientText(row.service_type, 120),
    preferredDate: safeClientText(row.preferred_date, 32),
    preferredTime: safeClientText(row.preferred_time ?? "", 32),
    detail: safeClientText(row.detail ?? "", 600),
    priority: safeClientText(row.priority, 32),
    status: safeClientText(row.status, 64),
    isPaid: Boolean(row.is_paid),
    paidAt: row.paid_at ? safeClientText(row.paid_at, 48) : null,
    createdAt: safeClientText(row.created_at, 48),
    apartmentName: safeClientTextOrNull(apartmentNameRaw, 120),
    apartmentCode: safeClientTextOrNull(apartmentCodeRaw, 64),
    taskId: t?.id ? safeClientText(t.id, 64) : null,
    taskStatus: t?.status ? safeClientText(t.status, 32) : null,
    assignedWorkerName: t ? safeClientTextOrNull(workerName(t.workers), 80) : null,
    orderId: ord?.id ? safeClientText(ord.id, 64) : null,
    orderPaymentStatus: safeClientTextOrNull(ord?.payment_status ?? null, 64),
    orderDispatchStatus: safeClientTextOrNull(ord?.dispatch_status ?? null, 64),
    orderFinalPaymentStatus: safeClientTextOrNull(ord?.final_payment_status ?? null, 64),
    orderTotalFinalFee: safeFee(ord?.total_final_fee),
    orderAdditionalDueAmount: ord
      ? computeAdditionalDueAmount({
          total_final_fee: ord.total_final_fee,
          base_fee: ord.base_fee,
          extra_fee_details: ord.extra_fee_details
        })
      : 0,
    orderWarrantyIssuedAt: ord?.warranty_issued_at ? safeClientText(ord.warranty_issued_at, 48) : null,
    virtualAccountNumber: safeClientTextOrNull(ord?.virtual_account_number ?? null, 80),
    virtualAccountHolder: virtualAccountHolderForDisplay(ord?.virtual_account_holder ?? null, addressText, apartmentNameForHolder)
  };
}

export async function pgListAdminCustomerCareRows(): Promise<AdminCustomerCareRow[]> {
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
      priority,
      status,
      is_paid,
      paid_at,
      created_at,
      apartments ( name, code ),
      tasks ( id, status, worker_id, workers ( name ) ),
      orders (
        id,
        payment_status,
        dispatch_status,
        final_payment_status,
        base_fee,
        total_final_fee,
        extra_fee_details,
        warranty_issued_at,
        virtual_account_number,
        virtual_account_holder,
        reservation_id
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`고객 통합 조회 실패: ${error.message}`);
  }
  return ((data as CareRow[] | null) ?? []).map(mapCareRow);
}

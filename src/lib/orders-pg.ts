import { buildPatentWarrantyNumber } from "@/lib/daekyung-fee-logic";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";
import { formatResidentDongHoDepositHolder } from "@/lib/resident-unit-label";
import { authHeader } from "@/lib/toss-agent";

type OrderResidentInfo = {
  name: string;
  phone: string;
  dong: string;
  ho: string;
};

type FinalPaymentStatus = "PENDING" | "REQUESTED" | "PAID" | "FAILED" | "CANCELLED";
type VirtualAccountIssueResult = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  dueAt: string;
  amount: number;
  raw?: Record<string, unknown>;
};

/**
 * 2026-07-19: 예전엔 50,000/100,000 두 단계로만 강제 고정했는데, 그러면 /admin/pricing에서
 * 기본 출장비·긴급출동 요금을 다른 금액으로 바꿔도 실제 청구액은 그대로였다(요금 설정 무의미화).
 * 이제 실제 입력값을 그대로 쓰고, 잘못된 값이 왔을 때만 안전한 최소값으로 보정한다.
 */
function normalizePrepaymentAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 10000 ? Math.round(amount) : 50000;
}

function mapServiceTypeToPatentKey(serviceType: string): string {
  const value = serviceType.trim();
  if (value.includes("누전")) return "LEAKAGE";
  if (value.includes("정기") || value.includes("진단")) return "DIAGNOSIS";
  if (value.includes("콘센트") || value.includes("스위치") || value.includes("점검/수리")) return "OUTLET";
  if (value.includes("전등")) return "LIGHT";
  return "VISIT";
}

export async function pgCreateOrder(input: {
  aptId: string;
  reservationId?: string;
  residentInfo: OrderResidentInfo;
  baseFee?: number;
}) {
  const supabase = requireSupabaseAdmin();
  const prepayment = normalizePrepaymentAmount(input.baseFee);
  const { data, error } = await supabase
    .from("orders")
    .insert({
      apt_id: input.aptId,
      /** migration 015+: `apartment_id` NOT NULL — PostgREST insert does not copy from `apt_id` */
      apartment_id: input.aptId,
      reservation_id: input.reservationId ?? null,
      resident_info: input.residentInfo,
      dong: input.residentInfo.dong.trim(),
      ho: input.residentInfo.ho.trim(),
      base_fee: prepayment,
      prepayment_amount: prepayment,
      payment_status: "PENDING",
      dispatch_status: "BLOCKED"
    })
    .select("id, apt_id, reservation_id, payment_status, dispatch_status, base_fee")
    .single();
  if (error || !data) {
    throw new Error(`주문 생성 실패: ${error?.message ?? "unknown"}`);
  }
  return data;
}

export async function pgMarkWaitingForDeposit(orderId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_status: "WAITING_FOR_DEPOSIT",
      pg_provider: "BANK_TRANSFER",
      updated_at: new Date().toISOString()
    })
    .eq("id", orderId.trim())
    .select("id, payment_status, dispatch_status")
    .single();
  if (error || !data) {
    throw new Error(`입금대기 상태 변경 실패: ${error?.message ?? "unknown"}`);
  }
  return data;
}

export async function pgSaveCardPaymentRef(input: {
  orderId: string;
  provider: "TOSS" | "PORTONE";
  paymentKey?: string;
  impUid?: string;
}) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .update({
      pg_provider: input.provider,
      payment_key: input.paymentKey ?? null,
      imp_uid: input.impUid ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.orderId.trim())
    .select("id, payment_status, dispatch_status, payment_key, imp_uid")
    .single();
  if (error || !data) {
    throw new Error(`결제 참조 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return data;
}

export async function pgMarkPaidAndActivate(input: {
  orderId: string;
  provider?: string;
  paymentKey?: string;
  impUid?: string;
}) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_status: "PAID",
      dispatch_status: "READY",
      pg_provider: input.provider ?? null,
      payment_key: input.paymentKey ?? null,
      imp_uid: input.impUid ?? null,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", input.orderId.trim())
    .select("id, reservation_id, payment_status, dispatch_status, paid_at")
    .single();
  if (error || !data) {
    throw new Error(`결제완료 반영 실패: ${error?.message ?? "unknown"}`);
  }
  return data;
}

export async function pgFindOrderById(orderId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reservation_id, apt_id, apartment_id, resident_info, payment_status, dispatch_status, payment_key, imp_uid, base_fee, total_final_fee, final_payment_status, extra_fee_details, warranty_issued_at, virtual_account_bank, virtual_account_number, virtual_account_holder, virtual_account_due_at, virtual_account_amount"
    )
    .eq("id", orderId.trim())
    .maybeSingle();
  if (error) {
    throw new Error(`주문 조회 실패: ${error.message}`);
  }
  return data;
}

export async function pgFindOrderByReservationId(reservationId: string) {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reservation_id, apt_id, apartment_id, payment_status, dispatch_status, payment_key, imp_uid, pg_provider, base_fee, total_final_fee, final_payment_status, extra_fee_details, warranty_issued_at, virtual_account_bank, virtual_account_number, virtual_account_holder, virtual_account_due_at, virtual_account_amount"
    )
    .eq("reservation_id", reservationId.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`주문 조회 실패: ${error.message}`);
  }
  return data;
}

export type AdminOrderRow = {
  id: string;
  apt_id: string | null;
  reservation_id: string | null;
  resident_info: { name?: string; phone?: string; dong?: string; ho?: string } | null;
  base_fee: number;
  payment_status: string;
  dispatch_status: string;
  final_payment_status: FinalPaymentStatus;
  total_final_fee: number | null;
  /** 이미 결제된 출장비를 제외하고 이번 정산에서 추가로 받아야 할 금액 (승인 확인용 — total_final_fee는 전체 총액) */
  additional_due_amount: number;
  virtual_account_bank: string | null;
  virtual_account_number: string | null;
  virtual_account_holder: string | null;
  virtual_account_due_at: string | null;
  virtual_account_amount: number | null;
  warranty_issued_at: string | null;
  paid_at: string | null;
  created_at: string;
};

/**
 * 정산 승인 화면에서 확정해야 할 금액은 total_final_fee(출장비 포함 전체 총액)가 아니라
 * 이미 결제된 출장비를 제외한 "이번에 추가로 받을 금액"이다. 작업완료 시 pgCompleteTask가
 * 남긴 extra_fee_details.additionalDueAmount를 우선 쓰고, 없으면 total_final_fee - base_fee로
 * 단 한 번만 계산한다(daekyung-fee-logic.ts의 amount_due_now와 동일한 단일 차감 원칙).
 */
export function computeAdditionalDueAmount(order: {
  total_final_fee?: number | null;
  base_fee?: number | null;
  extra_fee_details?: unknown;
}): number {
  const extraDetails = (order.extra_fee_details ?? {}) as Record<string, unknown>;
  if (typeof extraDetails.additionalDueAmount === "number" && Number.isFinite(extraDetails.additionalDueAmount)) {
    return Math.max(0, Math.round(extraDetails.additionalDueAmount));
  }
  return Math.max(0, Math.round((order.total_final_fee ?? 0) - (order.base_fee ?? 0)));
}

export async function pgListOrdersForAdmin(): Promise<AdminOrderRow[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, apt_id, reservation_id, resident_info, base_fee, payment_status, dispatch_status, final_payment_status, total_final_fee, extra_fee_details, virtual_account_bank, virtual_account_number, virtual_account_holder, virtual_account_due_at, virtual_account_amount, warranty_issued_at, paid_at, created_at"
    )
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`주문 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as Array<AdminOrderRow & { extra_fee_details?: unknown }>).map((row) => ({
    ...row,
    additional_due_amount: computeAdditionalDueAmount(row)
  }));
}

// IBK기업은행 — Toss 가상계좌 발급 API의 2자리 은행코드(https://docs.tosspayments.com/codes/org-codes).
const TOSS_VIRTUAL_ACCOUNT_BANK_CODE = "03";
const TOSS_VIRTUAL_ACCOUNT_BANK_NAME = "기업은행";

/**
 * Toss 가상계좌 발급: POST /v1/virtual-accounts.
 *
 * 2026-07-11 발견된 실제 프로덕션 버그: 예전엔 여기서 미설정 커스텀 env
 * (TOSS_VIRTUAL_ACCOUNT_ISSUE_URL, .env.example에도 없던 변수)가 없으면 무작위로 만든
 * 가짜 계좌번호(fallbackVirtualAccount)를 조용히 돌려줬다 — TOSS_SECRET_KEY는 실제로
 * 설정돼 있었는데도 그걸 안 쓰고 있었다. 그 결과 모든 고객이 실제로 존재하지 않는
 * 계좌로 입금을 시도하게 돼 "결제가 진행되지 않는" 문제가 발생했고, 매번 관리자가
 * 수동으로 입금완료 처리를 해야 했다. 이제 이미 검증된 TOSS_SECRET_KEY(다른 Toss API
 * 호출과 동일한 Basic 인증, src/lib/toss-agent.ts의 authHeader() 재사용)로 실제
 * Toss API를 호출한다. 실패 시 가짜 계좌로 폴백하지 않고 명확한 에러를 던진다 —
 * 결제 관련 코드는 조용히 틀린 데이터를 만들어내는 것보다 크게 실패하는 게 안전하다.
 */
async function issueVirtualAccountFromProvider(params: {
  orderId: string;
  amount: number;
  customerName: string;
  customerMobilePhone: string;
  /** 고객 화면·DB `virtual_account_holder`에 저장할 예금주 표기 (동·호) */
  displayHolder: string;
}): Promise<VirtualAccountIssueResult> {
  const response = await fetch("https://api.tosspayments.com/v1/virtual-accounts", {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: params.amount,
      orderId: params.orderId,
      orderName: "우리집 전기주치의 예약금",
      customerName: params.customerName || "입주민",
      customerMobilePhone: params.customerMobilePhone || undefined,
      bank: TOSS_VIRTUAL_ACCOUNT_BANK_CODE
    })
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Toss 가상계좌 발급 실패: ${(data.message as string) ?? response.status}`);
  }

  const va = (data.virtualAccount as Record<string, unknown> | undefined) ?? data;
  const accountNumber = String(va.accountNumber ?? "").trim();
  const dueDate = String(va.dueDate ?? "").trim();
  if (!accountNumber) {
    throw new Error("Toss 응답에 가상계좌 번호가 없습니다.");
  }
  return {
    bankName: TOSS_VIRTUAL_ACCOUNT_BANK_NAME,
    accountNumber,
    accountHolder: params.displayHolder,
    dueAt: dueDate || new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
    amount: params.amount,
    raw: data
  };
}

export async function pgIssueVirtualAccount(orderId: string) {
  const supabase = requireSupabaseAdmin();
  const normalized = orderId.trim();
  const order = await pgFindOrderById(normalized);
  if (!order) {
    throw new Error("주문 정보를 찾을 수 없습니다.");
  }
  const resident = (order.resident_info as Record<string, unknown> | undefined) ?? {};
  const customerName = String(resident.name ?? "입주민").trim();
  const customerMobilePhone = String(resident.phone ?? "").trim();
  const dong = String(resident.dong ?? "").trim().replaceAll(/[^0-9]/g, "");
  const ho = String(resident.ho ?? "").trim().replaceAll(/[^0-9]/g, "");
  const orderRow = order as { apartment_id?: string | null; apt_id?: string | null };
  const apartmentFk = orderRow.apartment_id ?? orderRow.apt_id;
  if (!apartmentFk) {
    throw new Error("주문에 연결된 단지(apartment)가 없습니다.");
  }
  const { data: apt, error: aptErr } = await supabase.from("apartments").select("*").eq("id", apartmentFk).maybeSingle();
  if (aptErr || !apt) {
    throw new Error(`아파트 코드 조회 실패: ${aptErr?.message ?? "not found"}`);
  }
  const aptRow = apt as { apt_code?: string | null; code?: string | null };
  const aptCodeForPg = String(aptRow.apt_code ?? aptRow.code ?? "").trim();
  if (!aptCodeForPg) {
    throw new Error("아파트 공개 코드(apt_code/code)가 비어 있습니다.");
  }
  const safeDong = dong || "000";
  const safeHo = ho || "000";
  const accountHolderName = `${aptCodeForPg}_${safeDong}_${safeHo}`;
  const displayHolder = formatResidentDongHoDepositHolder(dong, ho) || accountHolderName;
  const amount = normalizePrepaymentAmount(order.base_fee);

  const issued = await issueVirtualAccountFromProvider({
    orderId: normalized,
    amount,
    customerName,
    customerMobilePhone,
    displayHolder
  });

  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_status: "WAITING_FOR_DEPOSIT",
      pg_provider: "BANK_TRANSFER",
      virtual_account_bank: issued.bankName,
      virtual_account_number: issued.accountNumber.replaceAll(/[^0-9]/g, ""),
      virtual_account_holder: displayHolder,
      virtual_account_due_at: issued.dueAt,
      virtual_account_amount: amount,
      updated_at: new Date().toISOString()
    })
    .eq("id", normalized)
    .select(
      "id, payment_status, dispatch_status, virtual_account_bank, virtual_account_number, virtual_account_holder, virtual_account_due_at, virtual_account_amount"
    )
    .single();
  if (error || !data) {
    throw new Error(`가상계좌 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return data;
}

export async function pgRequestFinalSettlement(orderId: string) {
  const supabase = requireSupabaseAdmin();
  const normalized = orderId.trim();
  const order = await pgFindOrderById(normalized);
  if (!order) {
    throw new Error("주문 정보를 찾을 수 없습니다.");
  }
  const additionalDueAmount = computeAdditionalDueAmount(order);
  const status: FinalPaymentStatus = additionalDueAmount > 0 ? "REQUESTED" : "PAID";
  const { data, error } = await supabase
    .from("orders")
    .update({
      final_payment_status: status,
      updated_at: new Date().toISOString()
    })
    .eq("id", normalized)
    .select("id, reservation_id, total_final_fee, base_fee, final_payment_status, extra_fee_details")
    .single();
  if (error || !data) {
    throw new Error(`최종 정산 요청 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return {
    ...data,
    additional_due_amount: additionalDueAmount
  };
}

export async function pgMarkFinalPaymentPaidAndIssueWarranty(input: {
  orderId: string;
  provider?: "TOSS" | "PORTONE" | "MANUAL";
  paymentKey?: string;
  impUid?: string;
}) {
  const supabase = requireSupabaseAdmin();
  const normalized = input.orderId.trim();
  const order = await pgFindOrderById(normalized);
  if (!order) {
    throw new Error("주문 정보를 찾을 수 없습니다.");
  }
  if (!order.reservation_id) {
    throw new Error("연결된 예약 정보가 없어 보증서를 발급할 수 없습니다.");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { error: orderUpdateErr } = await supabase
    .from("orders")
    .update({
      final_payment_status: "PAID",
      pg_provider: input.provider ?? null,
      payment_key: input.paymentKey ?? null,
      imp_uid: input.impUid ?? null,
      warranty_issued_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", normalized);
  if (orderUpdateErr) {
    throw new Error(`최종 결제 상태 반영 실패: ${orderUpdateErr.message}`);
  }

  const { data: reservation, error: reservationErr } = await supabase
    .from("reservations")
    .select("id, apartment_id, technician_id, service_type, detail, total_amount, settled_at, image_urls, warranty_id")
    .eq("id", order.reservation_id)
    .maybeSingle();
  if (reservationErr || !reservation) {
    throw new Error(`예약 조회 실패: ${reservationErr?.message ?? "not found"}`);
  }
  if (!reservation.apartment_id) {
    throw new Error("아파트 정보가 없어 보증서를 발급할 수 없습니다.");
  }

  const { data: apt, error: aptErr } = await supabase
    .from("apartments")
    .select("apt_code")
    .eq("id", reservation.apartment_id)
    .maybeSingle();
  if (aptErr || !apt) {
    throw new Error(`아파트 코드 조회 실패: ${aptErr?.message ?? "not found"}`);
  }

  const issuedAt = reservation.settled_at ? new Date(reservation.settled_at) : now;
  const aptCodeRaw = String((apt as { apt_code?: string | null }).apt_code ?? "").trim();
  const warrantyNumber = buildPatentWarrantyNumber({
    issuedAt,
    reservationId: String(order.reservation_id),
    aptCode: aptCodeRaw || null
  });
  const startDate = issuedAt.toISOString().slice(0, 10);
  const endDate = new Date(issuedAt);
  endDate.setFullYear(endDate.getFullYear() + 1);
  const endDateText = endDate.toISOString().slice(0, 10);
  const verifyBase = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://www.dkansim.com";
  const verifyUrl = `${verifyBase.replace(/\/$/, "")}/verify/${encodeURIComponent(warrantyNumber)}`;
  const extraDetails = (order.extra_fee_details ?? {}) as Record<string, unknown>;
  const breakdown = Array.isArray(extraDetails.breakdown) ? extraDetails.breakdown.join(" | ") : "";
  const serviceSummary = `${reservation.detail ?? reservation.service_type ?? "현장 작업"}${breakdown ? ` / ${breakdown}` : ""}`;

  const { data: warranty, error: warrantyErr } = await supabase
    .from("warranties")
    .upsert(
      {
        warranty_number: warrantyNumber,
        reservation_id: reservation.id,
        apt_id: reservation.apartment_id,
        technician_id: reservation.technician_id ?? null,
        service_type: mapServiceTypeToPatentKey(reservation.service_type ?? "VISIT"),
        service_summary: serviceSummary,
        warranty_months: 12,
        warranty_start: startDate,
        warranty_end: endDateText,
        final_amount: reservation.total_amount ?? order.total_final_fee ?? 0,
        site_photos: Array.isArray(reservation.image_urls) ? (reservation.image_urls as string[]) : [],
        verify_url: verifyUrl,
        status: "ISSUED"
      },
      { onConflict: "reservation_id" }
    )
    .select("id, warranty_number")
    .single();
  if (warrantyErr || !warranty) {
    throw new Error(`보증서 저장 실패: ${warrantyErr?.message ?? "unknown"}`);
  }

  const { error: reservationUpdateErr } = await supabase
    .from("reservations")
    .update({
      payment_status: "SETTLED",
      warranty_id: warranty.id,
      warranty_status: "ISSUED"
    })
    .eq("id", reservation.id);
  if (reservationUpdateErr) {
    throw new Error(`예약 보증서 상태 반영 실패: ${reservationUpdateErr.message}`);
  }

  await supabase.from("order_logs").insert({
    reservation_id: reservation.id,
    status_from: "CONFIRMING",
    status_to: "SETTLED",
    actor: "SYSTEM_FINAL_PAYMENT",
    note: `ARCHIVE:${JSON.stringify({
      orderId: normalized,
      warrantyNumber,
      finalPaymentStatus: "PAID",
      settledAt: nowIso
    })}`
  });

  return {
    orderId: normalized,
    reservationId: reservation.id,
    warrantyId: warranty.id,
    warrantyNumber: warranty.warranty_number
  };
}

export async function activateDispatch(orderId: string) {
  const supabase = requireSupabaseAdmin();
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new Error("orderId가 비어 있습니다.");
  }

  const { data: order, error: readError } = await supabase
    .from("orders")
    .select("id, payment_status, dispatch_status")
    .eq("id", normalizedOrderId)
    .maybeSingle();
  if (readError) {
    throw new Error(`주문 조회 실패: ${readError.message}`);
  }
  if (!order) {
    throw new Error("주문 정보를 찾을 수 없습니다.");
  }

  if (order.payment_status !== "PAID") {
    throw new Error("기본 출장비 결제가 완료되지 않아 기사 배정을 시작할 수 없습니다.");
  }

  if (order.dispatch_status === "READY" || order.dispatch_status === "ACTIVE") {
    return order;
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ dispatch_status: "READY" })
    .eq("id", normalizedOrderId)
    .select("id, payment_status, dispatch_status")
    .single();
  if (updateError) {
    throw new Error(`배정 활성화 실패: ${updateError.message}`);
  }

  return updated;
}

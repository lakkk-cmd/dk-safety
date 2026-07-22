export interface ServiceItem {
  id: string;
  service_type: string;
  name: string;
  min_fee: number;
  max_fee: number;
  unit_price?: number;
  surcharge_flag: boolean;
  bulk_discount_flag: boolean;
  bulk_threshold: number;
  bulk_discount_rate: number;
  deductible_flag: boolean;
  negotiation_flag: boolean;
}

export interface FeeCalculationInput {
  base_fee: number;
  extra_fee: number;
  extra_fee_note?: string;
  service_item: ServiceItem;
  quantity?: number;
  work_proceeded: boolean;
}

export interface FeeValidation {
  is_valid: boolean;
  warnings: string[];
  errors: string[];
  surcharge_within_range: boolean;
  requires_confirmation: boolean;
}

export interface FeeCalculationResult {
  base_fee: number;
  extra_fee: number;
  subtotal: number;
  deductible_applied: boolean;
  deductible_amount: number;
  bulk_discount_applied: boolean;
  bulk_discount_amount: number;
  /** 이번 건 전체 정산 총액 (출장비 + 추가비용, 묶음할인만 반영 — 이미 결제한 출장비를 다시 빼지 않는다) */
  total_fee: number;
  /** 이미 결제된 출장비를 제외하고 이번에 추가로 받아야 할 금액 (total_fee에서 단 한 번만 차감) */
  amount_due_now: number;
  validation: FeeValidation;
  breakdown: string[];
}

export function calculate_final_fee(input: FeeCalculationInput): FeeCalculationResult {
  const { base_fee, extra_fee, service_item, quantity = 1, work_proceeded } = input;
  const breakdown: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  breakdown.push(`기본 출장비 (예약금 결제): ${base_fee.toLocaleString()}원`);
  let computed_extra = extra_fee;

  if (service_item.unit_price && quantity > 1) {
    computed_extra = service_item.unit_price * quantity;
    breakdown.push(`단가 ${service_item.unit_price.toLocaleString()}원 × ${quantity}개 = ${computed_extra.toLocaleString()}원`);
  } else if (extra_fee > 0) {
    breakdown.push(`현장 추가 비용: ${extra_fee.toLocaleString()}원 (${input.extra_fee_note ?? "사유 미기재"})`);
  }

  let bulk_discount_applied = false;
  let bulk_discount_amount = 0;
  if (service_item.bulk_discount_flag && quantity >= service_item.bulk_threshold && service_item.bulk_discount_rate > 0) {
    bulk_discount_amount = Math.floor(computed_extra * (service_item.bulk_discount_rate / 100));
    computed_extra -= bulk_discount_amount;
    bulk_discount_applied = true;
    breakdown.push(`묶음 할인 (${service_item.bulk_discount_rate}%): -${bulk_discount_amount.toLocaleString()}원`);
    warnings.push(`${service_item.bulk_threshold}개 이상 묶음 할인 ${service_item.bulk_discount_rate}% 적용됨`);
  }

  let surcharge_within_range = true;
  if (computed_extra > 0 && service_item.max_fee > 0) {
    const total_before_deduct = base_fee + computed_extra;
    if (total_before_deduct > service_item.max_fee * 2) {
      surcharge_within_range = false;
      errors.push(`추가 비용이 권장 최대 요금(${service_item.max_fee.toLocaleString()}원)의 2배를 초과합니다.`);
    } else if (!service_item.surcharge_flag && computed_extra > service_item.max_fee) {
      warnings.push("해당 서비스는 surcharge_flag=false 상태입니다.");
    }
  }

  const subtotal = base_fee + computed_extra;
  let deductible_applied = false;
  let deductible_amount = 0;
  if (service_item.deductible_flag && work_proceeded && computed_extra > 0) {
    deductible_amount = base_fee;
    deductible_applied = true;
    breakdown.push(`(참고) 출장비 ${deductible_amount.toLocaleString()}원은 예약 시 이미 결제되어, 추가로 받을 결제 금액에서 자동 차감됩니다`);
  }

  // total_fee: 이번 건의 전체 정산 총액. 이미 결제한 출장비를 여기서 다시 빼면 안 된다 —
  // 그러면 "출장비 공제"가 amount_due_now 계산과 이중으로 적용되어 총액·추가청구액이 모두
  // 출장비만큼 실제보다 낮게 잡힌다(과거 버그).
  const total_fee = subtotal;
  const amount_due_now = Math.max(0, total_fee - deductible_amount);
  breakdown.push("───────────────────────────");
  breakdown.push(`최종 정산 총액: ${total_fee.toLocaleString()}원`);
  if (deductible_amount > 0) {
    breakdown.push(`이번에 추가로 결제할 금액(출장비 기결제분 제외): ${amount_due_now.toLocaleString()}원`);
  }

  const requires_confirmation = computed_extra > 0 || bulk_discount_applied || deductible_applied || !surcharge_within_range;

  return {
    base_fee,
    extra_fee: computed_extra,
    subtotal,
    deductible_applied,
    deductible_amount,
    bulk_discount_applied,
    bulk_discount_amount,
    total_fee,
    amount_due_now,
    validation: {
      is_valid: errors.length === 0,
      warnings,
      errors,
      surcharge_within_range,
      requires_confirmation
    },
    breakdown
  };
}

/** 특허 청구항 8: 예약 식별자 기반 고유 보증 번호 — WST-YYYY-APTCODE-SEQ */
export function buildPatentWarrantyNumber(params: {
  issuedAt: Date;
  reservationId: string;
  aptCode?: string | null;
}): string {
  const year = params.issuedAt.getFullYear();
  const aptCode = (params.aptCode?.trim() || "APT").toUpperCase();
  const seq = params.reservationId.replace(/-/g, "").substring(0, 5).toUpperCase();
  return `WST-${year}-${aptCode}-${seq}`;
}

export function generate_warranty_number(params: {
  apt_code: string;
  reservation_id: string;
  issued_at?: Date;
}): string {
  return buildPatentWarrantyNumber({
    issuedAt: params.issued_at ?? new Date(),
    reservationId: params.reservation_id,
    aptCode: params.apt_code
  });
}

export interface GatewayActivationInput {
  order_id: string;
  prepayment_tx_id: string;
  paid_amount: number;
  base_fee: number;
}

export interface GatewayActivationResult {
  activated: boolean;
  reason?: string;
  prepayment_confirmed: boolean;
  timestamp: Date;
}

export function activate_assignment(input: GatewayActivationInput): GatewayActivationResult {
  const { paid_amount, base_fee, prepayment_tx_id } = input;
  const timestamp = new Date();
  if (paid_amount < base_fee) {
    return {
      activated: false,
      prepayment_confirmed: false,
      reason: `결제 금액(${paid_amount.toLocaleString()}원)이 기본 출장비(${base_fee.toLocaleString()}원)에 미달합니다.`,
      timestamp
    };
  }
  if (!prepayment_tx_id || !prepayment_tx_id.trim()) {
    return {
      activated: false,
      prepayment_confirmed: false,
      reason: "유효한 결제 거래 ID가 없습니다.",
      timestamp
    };
  }
  return { activated: true, prepayment_confirmed: true, timestamp };
}

export interface Technician {
  id: string;
  name: string;
  certifications: string[];
  is_available: boolean;
}

export function match_technician(technicians: Technician[], required_cert: string | null): Technician | null {
  const available = technicians.filter((t) => t.is_available);
  if (!required_cert) return available[0] ?? null;
  const qualified = available.filter((t) => t.certifications.includes(required_cert));
  return qualified[0] ?? null;
}

export const SERVICE_ITEM_SELECT_COLUMNS =
  "id, apt_id, service_type, name, description, min_fee, max_fee, unit_price, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, deductible_flag, negotiation_flag, required_cert, display_order, is_active";

export type ServiceItemAdminRow = {
  id: string;
  apt_id: string | null;
  service_type: string;
  name: string;
  description: string | null;
  min_fee: number | null;
  max_fee: number | null;
  unit_price: number | null;
  surcharge_flag: boolean;
  bulk_discount_flag: boolean;
  bulk_threshold: number;
  bulk_discount_rate: number;
  deductible_flag: boolean;
  negotiation_flag: boolean;
  required_cert: string | null;
  display_order: number;
  is_active: boolean;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 최종정산 계산식(calculate_final_fee)이 실제로 참조하는 컬럼만 정제해 저장한다. */
export function sanitizeServiceItemPayload(body: Record<string, unknown>) {
  const aptId = typeof body.apt_id === "string" ? body.apt_id.trim() : "";
  return {
    apt_id: aptId ? aptId : null,
    service_type: typeof body.service_type === "string" ? body.service_type.trim() : "",
    name: typeof body.name === "string" ? body.name.trim() : "",
    description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
    min_fee: toNumberOrNull(body.min_fee),
    max_fee: toNumberOrNull(body.max_fee),
    unit_price: toNumberOrNull(body.unit_price),
    surcharge_flag: Boolean(body.surcharge_flag),
    bulk_discount_flag: Boolean(body.bulk_discount_flag),
    bulk_threshold: toNumberOrNull(body.bulk_threshold) ?? 5,
    bulk_discount_rate: toNumberOrNull(body.bulk_discount_rate) ?? 0,
    deductible_flag: Boolean(body.deductible_flag),
    negotiation_flag: Boolean(body.negotiation_flag),
    required_cert: typeof body.required_cert === "string" && body.required_cert.trim() ? body.required_cert.trim() : null,
    display_order: toNumberOrNull(body.display_order) ?? 0,
    is_active: body.is_active === undefined ? true : Boolean(body.is_active)
  };
}

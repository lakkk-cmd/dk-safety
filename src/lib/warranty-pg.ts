import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type WarrantyView = {
  id: string;
  warrantyNumber: string;
  reservationId: string;
  apartmentCode: string;
  apartmentName: string;
  technicianName: string | null;
  serviceType: string | null;
  serviceSummary: string | null;
  warrantyMonths: number;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  finalAmount: number | null;
  verifyUrl: string | null;
  issuedAt: string;
  status: "PENDING" | "ISSUED" | "EXPIRED" | "VOIDED";
};

type WarrantyRow = {
  id: string;
  warranty_number: string;
  reservation_id: string;
  service_type: string | null;
  service_summary: string | null;
  warranty_months: number;
  warranty_start: string | null;
  warranty_end: string | null;
  final_amount: number | null;
  verify_url: string | null;
  issued_at: string;
  status: "PENDING" | "ISSUED" | "EXPIRED" | "VOIDED";
  apartments: { apt_code: string; name: string } | { apt_code: string; name: string }[] | null;
  workers: { name: string } | { name: string }[] | null;
};

function mapJoinOne<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapWarranty(row: WarrantyRow): WarrantyView {
  const apt = mapJoinOne(row.apartments);
  const worker = mapJoinOne(row.workers);
  return {
    id: row.id,
    warrantyNumber: row.warranty_number,
    reservationId: row.reservation_id,
    apartmentCode: apt?.apt_code ?? "",
    apartmentName: apt?.name ?? "미지정",
    technicianName: worker?.name ?? null,
    serviceType: row.service_type,
    serviceSummary: row.service_summary,
    warrantyMonths: Number.isFinite(row.warranty_months) ? Number(row.warranty_months) : 12,
    warrantyStart: row.warranty_start,
    warrantyEnd: row.warranty_end,
    finalAmount: row.final_amount,
    verifyUrl: row.verify_url,
    issuedAt: row.issued_at,
    status: row.status
  };
}

export async function pgFindWarrantyByNumber(warrantyNumber: string): Promise<WarrantyView | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("warranties")
    .select(
      `
      id,
      warranty_number,
      reservation_id,
      service_type,
      service_summary,
      warranty_months,
      warranty_start,
      warranty_end,
      final_amount,
      verify_url,
      issued_at,
      status,
      apartments ( apt_code, name ),
      workers ( name )
    `
    )
    .eq("warranty_number", warrantyNumber)
    .maybeSingle();
  if (error) {
    throw new Error(`보증서 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapWarranty(data as WarrantyRow);
}

export async function pgFindWarrantyByReservationId(reservationId: string): Promise<WarrantyView | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("warranties")
    .select(
      `
      id,
      warranty_number,
      reservation_id,
      service_type,
      service_summary,
      warranty_months,
      warranty_start,
      warranty_end,
      final_amount,
      verify_url,
      issued_at,
      status,
      apartments ( apt_code, name ),
      workers ( name )
    `
    )
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (error) {
    throw new Error(`예약 보증서 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapWarranty(data as WarrantyRow);
}

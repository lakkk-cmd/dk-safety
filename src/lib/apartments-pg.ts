import type { PostgrestError } from "@supabase/supabase-js";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type ApartmentTenant = {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
  baseFee: number;
  createdAt: string;
};

type ApartmentRow = {
  id: string;
  name: string;
  /** 레거시 마이그레이션(004) */
  code?: string | null;
  /** 특허/통합 스키마(005+) 공개 단지 코드 */
  apt_code?: string | null;
  logo_url: string | null;
  bank_info: { bankName?: string; accountNumber?: string; accountHolder?: string } | null;
  base_fee: number;
  created_at: string;
};

function publicApartmentCode(row: ApartmentRow): string {
  const raw = String(row.code ?? row.apt_code ?? "")
    .trim()
    .toLowerCase();
  return raw;
}

function mapApartment(row: ApartmentRow): ApartmentTenant {
  return {
    id: row.id,
    name: row.name,
    code: publicApartmentCode(row),
    logoUrl: row.logo_url,
    bankInfo: {
      bankName: row.bank_info?.bankName ?? "국민은행",
      accountNumber: row.bank_info?.accountNumber ?? "",
      accountHolder: row.bank_info?.accountHolder ?? row.name
    },
    baseFee: Number.isFinite(row.base_fee) ? Number(row.base_fee) : 50000,
    createdAt: row.created_at
  };
}

export async function pgListApartments(): Promise<ApartmentTenant[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("apartments").select("*").order("created_at", { ascending: false });
  if (error) {
    throw new Error(`아파트 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as ApartmentRow[]).map(mapApartment);
}

function apartmentsMissingColumn(err: PostgrestError, column: "code" | "apt_code"): boolean {
  const m = err.message ?? "";
  return (
    m.includes(`'${column}' column of 'apartments'`) ||
    m.includes(`column apartments.${column} does not exist`) ||
    (m.includes("apartments") && m.includes("schema cache") && m.includes(column))
  );
}

export async function pgFindApartmentByCode(code: string): Promise<ApartmentTenant | null> {
  const supabase = requireSupabaseAdmin();
  const normalized = code.trim().toLowerCase();

  const tryEq = async (column: "apt_code" | "code") => supabase.from("apartments").select("*").eq(column, normalized).maybeSingle();

  let { data, error } = await tryEq("apt_code");
  if (error && apartmentsMissingColumn(error, "apt_code")) {
    ({ data, error } = await tryEq("code"));
  } else if (error) {
    throw new Error(`아파트 조회 실패: ${error.message}`);
  } else if (!data) {
    ({ data, error } = await tryEq("code"));
    if (error && apartmentsMissingColumn(error, "code")) {
      return null;
    }
  }

  if (error) {
    throw new Error(`아파트 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapApartment(data as ApartmentRow);
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pgFindApartmentByIdentifier(aptId: string): Promise<ApartmentTenant | null> {
  const trimmed = aptId.trim();
  if (!trimmed) return null;

  if (UUID_LIKE.test(trimmed)) {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase.from("apartments").select("*").eq("id", trimmed).maybeSingle();
    if (error) {
      throw new Error(`아파트 식별 조회 실패: ${error.message}`);
    }
    if (!data) return null;
    return mapApartment(data as ApartmentRow);
  }

  return pgFindApartmentByCode(trimmed);
}

export async function pgCreateApartment(input: {
  name: string;
  code: string;
  logoUrl?: string;
  bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
  baseFee: number;
}): Promise<ApartmentTenant> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("apartments")
    .insert({
      name: input.name.trim(),
      code: input.code.trim().toLowerCase(),
      logo_url: input.logoUrl?.trim() || null,
      bank_info: input.bankInfo,
      base_fee: Math.max(50000, Math.round(input.baseFee))
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`아파트 생성 실패: ${error?.message ?? "unknown"}`);
  }
  return mapApartment(data as ApartmentRow);
}

export async function pgUpdateApartment(
  id: string,
  patch: Partial<{
    name: string;
    code: string;
    logoUrl: string;
    bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
    baseFee: number;
  }>
): Promise<ApartmentTenant | null> {
  const supabase = requireSupabaseAdmin();
  const payload: Record<string, unknown> = {};
  if (typeof patch.name === "string") payload.name = patch.name.trim();
  if (typeof patch.code === "string") payload.code = patch.code.trim().toLowerCase();
  if (typeof patch.logoUrl === "string") payload.logo_url = patch.logoUrl.trim() || null;
  if (patch.bankInfo) payload.bank_info = patch.bankInfo;
  if (typeof patch.baseFee === "number") payload.base_fee = Math.max(50000, Math.round(patch.baseFee));
  if (Object.keys(payload).length === 0) return null;

  const { data, error } = await supabase.from("apartments").update(payload).eq("id", id).select("*").maybeSingle();
  if (error) {
    throw new Error(`아파트 수정 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapApartment(data as ApartmentRow);
}

export async function pgDeleteApartment(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.from("apartments").delete().eq("id", id);
  if (error) {
    throw new Error(`아파트 삭제 실패: ${error.message}`);
  }
}

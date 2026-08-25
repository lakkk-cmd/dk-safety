import type { PostgrestError } from "@supabase/supabase-js";
import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type ApartmentTenant = {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
  baseFee: number;
  /** 광주 구 단위 분류(동구/서구/남구/북구/광산구/기타) — 관리자 목록 탭·검색용, 미지정이면 빈 문자열(086) */
  district: string;
  /** 실제 소재지 주소(도로명/지번) — 미지정이면 빈 문자열 */
  address: string;
  /** 단지 전기선임자 성명 — 세대전기점검표 문서 명의/서명란에 자동 삽입(100) */
  electricalSafetyManagerName: string;
  /** 절연저항 부적합 판정 기준값(MΩ) — 세대 누전차단기 회로 구성에 맞춰 단지별로 다름(102). 미설정이면 null. */
  insulationResistanceThresholdMohm: number | null;
  /** 누설전류(IGR) 부적합 판정 기준값(mA) — 누전차단기 미설치/동작불량 항목 자동판정용(103). 미설정이면 null. */
  leakageCurrentThresholdMa: number | null;
  /** 단지 총세대수 — 세대전기점검 처리율 계산용(105). 미설정이면 null. */
  totalUnits: number | null;
  /** 정식계약(contract) vs 세대전기점검 무료앱만 쓰는 단지(free_app)(109). */
  partnershipType: "contract" | "free_app";
  /** 단지 준공일 — 법적 판정 기준 아님, 노후도 참고용(110). 미설정이면 null. */
  completionDate: string | null;
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
  district?: string | null;
  address?: string | null;
  electrical_safety_manager_name?: string | null;
  insulation_resistance_threshold_mohm?: number | null;
  leakage_current_threshold_ma?: number | null;
  total_units?: number | null;
  partnership_type?: string | null;
  completion_date?: string | null;
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
    district: row.district?.trim() ?? "",
    address: row.address?.trim() ?? "",
    electricalSafetyManagerName: row.electrical_safety_manager_name?.trim() ?? "",
    insulationResistanceThresholdMohm:
      typeof row.insulation_resistance_threshold_mohm === "number" && Number.isFinite(row.insulation_resistance_threshold_mohm)
        ? row.insulation_resistance_threshold_mohm
        : null,
    leakageCurrentThresholdMa:
      typeof row.leakage_current_threshold_ma === "number" && Number.isFinite(row.leakage_current_threshold_ma)
        ? row.leakage_current_threshold_ma
        : null,
    totalUnits: typeof row.total_units === "number" && Number.isFinite(row.total_units) ? row.total_units : null,
    partnershipType: row.partnership_type === "free_app" ? "free_app" : "contract",
    completionDate: row.completion_date ?? null,
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

/** 세대전기점검 무료앱 가입신청 화면(공개)용 — 계좌정보 등 민감값 없이 이름/세대수만 노출. */
export async function pgListApartmentsPublicForSignup(): Promise<{ id: string; name: string; totalUnits: number | null }[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("apartments").select("id, name, total_units").order("name", { ascending: true });
  if (error) {
    throw new Error(`아파트 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as { id: string; name: string; total_units: number | null }[]).map((row) => ({
    id: row.id,
    name: row.name,
    totalUnits: row.total_units
  }));
}

/** 세대전기점검 무료앱 가입신청 시 — 다음 우편번호 검색으로 얻은 단지명이 이미 등록된 단지와
 * (대소문자·앞뒤공백 무시) 정확히 일치하면 그 단지에 연결한다. 안 그러면 대표님이 미리 세팅해둔
 * 전기선임자·판정기준값이 무시된 채 같은 단지가 중복 생성된다. */
export async function pgFindApartmentByExactName(name: string): Promise<ApartmentTenant | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("apartments").select("*").ilike("name", trimmed).maybeSingle();
  if (error) {
    throw new Error(`단지명 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapApartment(data as ApartmentRow);
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
  district?: string;
  address?: string;
  electricalSafetyManagerName?: string;
  insulationResistanceThresholdMohm?: number | null;
  leakageCurrentThresholdMa?: number | null;
  totalUnits?: number | null;
}): Promise<ApartmentTenant> {
  const supabase = requireSupabaseAdmin();
  const normalizedCode = input.code.trim().toLowerCase();
  const { data, error } = await supabase
    .from("apartments")
    .insert({
      name: input.name.trim(),
      code: normalizedCode,
      // apt_code/apt_id: 015/016 마이그레이션에서 추가된 NOT NULL(+apt_id는 UNIQUE) 레거시
      // 컬럼 — code와 항상 같은 값으로 채워야 한다. 빠뜨리면 INSERT가 그대로 실패한다.
      apt_code: normalizedCode,
      apt_id: normalizedCode,
      logo_url: input.logoUrl?.trim() || null,
      bank_info: input.bankInfo,
      base_fee: Math.max(50000, Math.round(input.baseFee)),
      district: input.district?.trim() || "",
      address: input.address?.trim() || "",
      electrical_safety_manager_name: input.electricalSafetyManagerName?.trim() || null,
      insulation_resistance_threshold_mohm: input.insulationResistanceThresholdMohm ?? null,
      leakage_current_threshold_ma: input.leakageCurrentThresholdMa ?? null,
      total_units: input.totalUnits ?? null
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
    district: string;
    address: string;
    electricalSafetyManagerName: string;
    insulationResistanceThresholdMohm: number | null;
    leakageCurrentThresholdMa: number | null;
    totalUnits: number | null;
    partnershipType: "contract" | "free_app";
  }>
): Promise<ApartmentTenant | null> {
  const supabase = requireSupabaseAdmin();
  const payload: Record<string, unknown> = {};
  if (typeof patch.name === "string") payload.name = patch.name.trim();
  if (typeof patch.code === "string") {
    const normalizedCode = patch.code.trim().toLowerCase();
    payload.code = normalizedCode;
    // apt_code/apt_id도 항상 code와 같은 값으로 유지 — pgCreateApartment 참고
    payload.apt_code = normalizedCode;
    payload.apt_id = normalizedCode;
  }
  if (typeof patch.logoUrl === "string") payload.logo_url = patch.logoUrl.trim() || null;
  if (patch.bankInfo) payload.bank_info = patch.bankInfo;
  if (typeof patch.baseFee === "number") payload.base_fee = Math.max(50000, Math.round(patch.baseFee));
  if (typeof patch.district === "string") payload.district = patch.district.trim();
  if (typeof patch.address === "string") payload.address = patch.address.trim();
  if (typeof patch.electricalSafetyManagerName === "string") payload.electrical_safety_manager_name = patch.electricalSafetyManagerName.trim() || null;
  if (patch.insulationResistanceThresholdMohm !== undefined) payload.insulation_resistance_threshold_mohm = patch.insulationResistanceThresholdMohm;
  if (patch.leakageCurrentThresholdMa !== undefined) payload.leakage_current_threshold_ma = patch.leakageCurrentThresholdMa;
  if (patch.totalUnits !== undefined) payload.total_units = patch.totalUnits;
  if (typeof patch.partnershipType === "string") payload.partnership_type = patch.partnershipType;
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

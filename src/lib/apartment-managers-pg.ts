import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApartmentManager = {
  id: string;
  apartmentId: string | null;
  name: string;
  phone: string;
  loginId: string;
  passwordHash: string;
  approvalStatus: ApprovalStatus;
  approvedAt: string | null;
  rejectedReason: string | null;
  lastLoginAt: string | null;
  passwordResetAt: string | null;
  apartmentNameRequested: string | null;
  apartmentAddressRequested: string | null;
  totalUnitsRequested: number | null;
  createdAt: string;
};

type ApartmentManagerRow = {
  id: string;
  apartment_id: string | null;
  name: string;
  phone: string;
  login_id: string;
  password_hash: string;
  approval_status: string;
  approved_at: string | null;
  rejected_reason: string | null;
  last_login_at: string | null;
  password_reset_at: string | null;
  apartment_name_requested: string | null;
  apartment_address_requested: string | null;
  total_units_requested: number | null;
  created_at: string;
};

function mapManager(row: ApartmentManagerRow): ApartmentManager {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    name: row.name,
    phone: row.phone,
    loginId: row.login_id,
    passwordHash: row.password_hash,
    approvalStatus: (row.approval_status as ApprovalStatus) ?? "pending",
    approvedAt: row.approved_at,
    rejectedReason: row.rejected_reason,
    lastLoginAt: row.last_login_at,
    passwordResetAt: row.password_reset_at,
    apartmentNameRequested: row.apartment_name_requested,
    apartmentAddressRequested: row.apartment_address_requested,
    totalUnitsRequested: row.total_units_requested,
    createdAt: row.created_at
  };
}

export async function pgIsApartmentManagerLoginIdTaken(loginId: string): Promise<boolean> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("apartment_managers")
    .select("id")
    .ilike("login_id", loginId.trim())
    .maybeSingle();
  if (error) {
    throw new Error(`아이디 중복 확인 실패: ${error.message}`);
  }
  return Boolean(data);
}

export async function pgCreateApartmentManagerSignup(input: {
  apartmentId: string | null;
  apartmentNameRequested: string | null;
  apartmentAddressRequested: string | null;
  totalUnitsRequested: number | null;
  name: string;
  phone: string;
  loginId: string;
  passwordHash: string;
}): Promise<ApartmentManager> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("apartment_managers")
    .insert({
      apartment_id: input.apartmentId,
      apartment_name_requested: input.apartmentNameRequested,
      apartment_address_requested: input.apartmentAddressRequested,
      total_units_requested: input.totalUnitsRequested,
      name: input.name.trim(),
      phone: input.phone.trim(),
      login_id: input.loginId.trim(),
      password_hash: input.passwordHash
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`가입신청 저장 실패: ${error?.message ?? "unknown"}`);
  }
  return mapManager(data as ApartmentManagerRow);
}

export async function pgFindApartmentManagerByLoginId(loginId: string): Promise<ApartmentManager | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("apartment_managers")
    .select("*")
    .ilike("login_id", loginId.trim())
    .maybeSingle();
  if (error) {
    throw new Error(`계정 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapManager(data as ApartmentManagerRow);
}

export async function pgGetApartmentManager(id: string): Promise<ApartmentManager | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("apartment_managers").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`계정 조회 실패: ${error.message}`);
  }
  if (!data) return null;
  return mapManager(data as ApartmentManagerRow);
}

export async function pgListApartmentManagers(status?: ApprovalStatus): Promise<ApartmentManager[]> {
  const supabase = requireSupabaseAdmin();
  let query = supabase.from("apartment_managers").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("approval_status", status);
  const { data, error } = await query;
  if (error) {
    throw new Error(`전기과장 계정 목록 조회 실패: ${error.message}`);
  }
  return ((data ?? []) as ApartmentManagerRow[]).map(mapManager);
}

/** 신규단지 요청이면 apartments 행 생성까지 원자적으로 처리한다(migration 109 함수). */
export async function pgApproveApartmentManagerSignup(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase.rpc("approve_apartment_manager_signup", { p_manager_id: id });
  if (error) {
    throw new Error(`승인 처리 실패: ${error.message}`);
  }
}

export async function pgRejectApartmentManagerSignup(id: string, reason: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("apartment_managers")
    .update({ approval_status: "rejected", rejected_reason: reason.trim() || null })
    .eq("id", id);
  if (error) {
    throw new Error(`거절 처리 실패: ${error.message}`);
  }
}

export async function pgResetApartmentManagerPassword(id: string, newPasswordHash: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("apartment_managers")
    .update({ password_hash: newPasswordHash, password_reset_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(`비밀번호 재발급 실패: ${error.message}`);
  }
}

export async function pgTouchApartmentManagerLastLogin(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  const { error } = await supabase
    .from("apartment_managers")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(`로그인 시각 갱신 실패: ${error.message}`);
  }
}

import { requireSupabaseAdmin } from "@/lib/supabase-pg";

export type AdminAccountPublic = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export async function pgListAdminAccounts(): Promise<AdminAccountPublic[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_accounts")
    .select("id, name, phone, active, created_at, last_login_at")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`관리자 계정 목록 조회 실패: ${error.message}`);
  }
  return (
    data?.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      active: row.active,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    })) ?? []
  );
}

export async function pgFindAdminAccountByPhone(phone: string): Promise<{ id: string; name: string; password_hash: string; active: boolean } | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_accounts")
    .select("id, name, password_hash, active")
    .ilike("phone", phone.trim())
    .maybeSingle();
  if (error) {
    throw new Error(`관리자 계정 조회 실패: ${error.message}`);
  }
  return data ?? null;
}

export async function pgCountActiveAdminAccounts(): Promise<number> {
  const supabase = requireSupabaseAdmin();
  const { count, error } = await supabase
    .from("admin_accounts")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if (error) {
    throw new Error(`관리자 계정 수 조회 실패: ${error.message}`);
  }
  return count ?? 0;
}

export async function pgCreateAdminAccount(input: { name: string; phone: string; passwordHash: string }): Promise<AdminAccountPublic> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_accounts")
    .insert({
      name: input.name.trim(),
      phone: input.phone.trim(),
      password_hash: input.passwordHash,
      active: true
    })
    .select("id, name, phone, active, created_at, last_login_at")
    .single();
  if (error || !data) {
    throw new Error(`관리자 계정 등록 실패: ${error?.message ?? "unknown"}`);
  }
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    active: data.active,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at
  };
}

export async function pgUpdateAdminAccount(
  id: string,
  patch: { name?: string; phone?: string; passwordHash?: string; active?: boolean }
): Promise<AdminAccountPublic> {
  const supabase = requireSupabaseAdmin();
  const update: Record<string, unknown> = {};
  if (typeof patch.name === "string") update.name = patch.name.trim();
  if (typeof patch.phone === "string") update.phone = patch.phone.trim();
  if (typeof patch.passwordHash === "string") update.password_hash = patch.passwordHash;
  if (typeof patch.active === "boolean") update.active = patch.active;

  const { data, error } = await supabase
    .from("admin_accounts")
    .update(update)
    .eq("id", id)
    .select("id, name, phone, active, created_at, last_login_at")
    .single();
  if (error || !data) {
    throw new Error(`관리자 계정 수정 실패: ${error?.message ?? "unknown"}`);
  }
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    active: data.active,
    createdAt: data.created_at,
    lastLoginAt: data.last_login_at
  };
}

export async function pgTouchAdminLastLogin(id: string): Promise<void> {
  const supabase = requireSupabaseAdmin();
  await supabase.from("admin_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}

export async function pgGetAdminAccountName(id: string): Promise<string | null> {
  const supabase = requireSupabaseAdmin();
  const { data } = await supabase.from("admin_accounts").select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}

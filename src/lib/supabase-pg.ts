import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-url";

export function usesSupabaseReservationsDb(): boolean {
  const v = process.env.DK_SAFETY_USE_SUPABASE_DB ?? "";
  return v === "1" || v.toLowerCase() === "true";
}

let cached: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!usesSupabaseReservationsDb()) {
    return null;
  }
  const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return null;
  }
  if (cached === undefined) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return cached;
}

/** DB 플래그가 켜져 있고 Supabase URL·서비스 롤 키까지 있을 때만 안전하게 쿼리 가능 */
export function isSupabaseReservationsDbReady(): boolean {
  return usesSupabaseReservationsDb() && Boolean(getSupabaseAdmin());
}

export function requireSupabaseAdmin(): SupabaseClient {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error("Supabase DB 모드이지만 URL 또는 서비스 롤 키가 없습니다.");
  }
  return client;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-url";

let cached: SupabaseClient | null | undefined;

/** 에이전트 Cron·사령부 API — DK_SAFETY_USE_SUPABASE_DB 와 무관하게 URL+서비스 롤만 있으면 동작 */
export function getAgentSupabase(): SupabaseClient | null {
  const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) return null;
  if (cached === undefined) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
}

export function requireAgentSupabase(): SupabaseClient {
  const client = getAgentSupabase();
  if (!client) {
    throw new Error(
      "Supabase가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인하세요.",
    );
  }
  return client;
}

export function isAgentSupabaseReady(): boolean {
  return Boolean(getAgentSupabase());
}

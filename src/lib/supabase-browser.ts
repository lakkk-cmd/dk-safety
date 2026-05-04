"use client";

import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-url";

/**
 * 브라우저용(anon JWT 또는 sb_publishable_…).
 * REST에서 anon이 401이면 대시보드의 Publishable 키를 NEXT_PUBLIC_SUPABASE_ANON_KEY에 넣으세요.
 * 서버 API는 SUPABASE_SERVICE_ROLE_KEY만 사용합니다.
 */
export function createBrowserSupabase() {
  const url = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

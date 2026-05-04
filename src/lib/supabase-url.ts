/** Supabase 프로젝트 루트 URL (복사 시 /rest/v1/ 가 붙은 경우 제거) */
export function normalizeSupabaseProjectUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  u = u.replace(/\/$/, "");
  u = u.replace(/\/rest\/v1\/?$/i, "");
  return u.replace(/\/$/, "");
}

/** 관리자/기사/고객 APK 다운로드 링크 — build-mobile-apks.yml이 매 빌드마다 같은 경로에
 *  덮어써서(x-upsert) 업로드하므로, 새 빌드가 나와도 이 URL은 그대로 유지된다. */
import { normalizeSupabaseProjectUrl } from "@/lib/supabase-url";

const SUPABASE_URL = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const APK_BUCKET = process.env.SUPABASE_APK_BUCKET ?? "dk-safety-apks";

function apkUrl(app: "admin-app" | "worker-app" | "customer-app"): string | null {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${APK_BUCKET}/${app}.apk`;
}

export const ADMIN_APK_URL = apkUrl("admin-app");
export const WORKER_APK_URL = apkUrl("worker-app");
export const CUSTOMER_APK_URL = apkUrl("customer-app");

import HomeClient from "@/components/home/home-client";
import { pgListApartments } from "@/lib/apartments-pg";
import { getAgentSupabase } from "@/lib/agent-db";
import { CUSTOMER_APK_URL } from "@/lib/mobile-apps";

// site_config(공지/시즌 배너)를 chat의 apply_site_decision이 "즉시 반영"이라고 안내하는데,
// 이 페이지가 정적 프리렌더로 빌드타임에 굳어버리면 다음 배포 전까지 실제로는 반영되지 않는다
// (2026-09, 히어로/배너 재구성 중 발견). 다른 site_config 의존 페이지들과 동일하게 강제 동적 렌더.
export const dynamic = "force-dynamic";

async function getSiteConfig(): Promise<Record<string, string>> {
  try {
    const supabase = getAgentSupabase();
    if (!supabase) return {};
    const { data } = await supabase.from("site_config").select("key, value");
    const config: Record<string, string> = {};
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      config[row.key] = row.value;
    }
    return config;
  } catch {
    return {};
  }
}

export default async function MainHomePage() {
  const [apartments, config] = await Promise.all([
    pgListApartments()
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          apt_code: row.code,
          logo_url: row.logoUrl,
        })),
      )
      .catch(() => []),
    getSiteConfig(),
  ]);

  return <HomeClient apartments={apartments} config={config} apkUrl={CUSTOMER_APK_URL} />;
}

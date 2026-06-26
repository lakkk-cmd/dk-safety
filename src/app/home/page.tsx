import HomeClient from "@/components/home/home-client";
import { pgListApartments } from "@/lib/apartments-pg";
import { getAgentSupabase } from "@/lib/agent-db";

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

  return <HomeClient apartments={apartments} config={config} />;
}

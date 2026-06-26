import { NextResponse } from "next/server";
import { requireAgentSupabase } from "@/lib/agent-db";

// 카테고리별 key 접두사 매핑
const CATEGORY_KEYS: Record<string, string[]> = {
  pricing: ["basic_price", "full_price", "extra_fee", "dispatch_fee"],
  cta: ["hero_title", "hero_cta", "bottom_cta", "hero_subtitle"],
  notice: ["notice_text", "notice_enabled", "banner_text", "banner_enabled"],
  service: ["service_title", "service_desc", "service_items", "open_hours"],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const supabase = requireAgentSupabase();

  let query = supabase.from("site_config").select("key, value, category, updated_at");

  if (category && CATEGORY_KEYS[category]) {
    query = query.in("key", CATEGORY_KEYS[category]);
  } else if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query.order("key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { key: string; value: string; category: string; updated_at: string }[];
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }

  return NextResponse.json({ config }, { headers: { "Cache-Control": "no-store" } });
}

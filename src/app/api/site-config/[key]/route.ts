import { NextResponse } from "next/server";
import { requireAgentSupabase } from "@/lib/agent-db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("site_config")
    .select("key, value, updated_at")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: `키를 찾을 수 없습니다: ${key}` }, { status: 404 });
  }

  const row = data as { key: string; value: string; updated_at: string };
  return NextResponse.json(
    { key: row.key, value: row.value, updated_at: row.updated_at },
    { headers: { "Cache-Control": "no-store" } },
  );
}

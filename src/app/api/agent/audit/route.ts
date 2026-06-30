import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

function checkReadAuth(request: Request): boolean {
  const secret = (process.env.AGENT_READ_SECRET?.trim() || process.env.AGENT_WRITE_SECRET?.trim()) ?? "";
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!checkReadAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const action = searchParams.get("action");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

  const supabase = requireAgentSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("agent_logs")
    .select("id, level, source, message, meta, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (table) q = q.contains("meta", { table });
  if (action) q = q.contains("meta", { action });
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [], total_count: count ?? 0 });
}

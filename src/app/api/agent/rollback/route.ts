import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { logAgentEvent } from "@/lib/pipeline-logs";

function checkAuth(request: Request): string | null {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return "AGENT_WRITE_SECRET가 설정되지 않았습니다.";
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) return "인증 실패";
  return null;
}

export async function POST(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: { log_id?: string; boss_confirmed?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const authError = checkAuth(request);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError.includes("인증") ? 401 : 500 });
  }
  if (!body.boss_confirmed) {
    return NextResponse.json({ error: "boss_confirmed: true 필드가 필요합니다." }, { status: 403 });
  }
  if (!body.log_id) {
    return NextResponse.json({ error: "log_id 파라미터가 필요합니다." }, { status: 400 });
  }

  const supabase = requireAgentSupabase();

  const { data: logData, error: logError } = await supabase
    .from("agent_logs")
    .select("id, meta")
    .eq("id", body.log_id)
    .maybeSingle();

  if (logError || !logData) {
    return NextResponse.json({ error: "해당 log_id를 찾을 수 없습니다." }, { status: 404 });
  }

  const meta = (logData as { meta?: Record<string, unknown> }).meta ?? {};
  if (meta.snapshot_type !== "before") {
    return NextResponse.json({ error: "해당 로그는 before_snapshot이 아닙니다." }, { status: 400 });
  }

  const table = meta.table as string;
  const rows = meta.data as Array<Record<string, unknown>>;

  if (!table || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "복구할 데이터가 없습니다." }, { status: 400 });
  }

  const { error: upsertError } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (upsertError) {
    return NextResponse.json({ error: `복구 실패: ${upsertError.message}` }, { status: 500 });
  }

  await logAgentEvent("warn", "agent-rollback", `롤백 실행: ${table} (log_id: ${body.log_id})`, {
    table, restored_rows: rows.length, log_id: body.log_id,
  });

  return NextResponse.json({ success: true, restored_rows: rows.length });
}

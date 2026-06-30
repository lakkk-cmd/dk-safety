import { NextResponse } from "next/server";
import { executeQuery, executeWrite, ALLOWED_TABLES, type WriteAction, type WriteData } from "@/lib/supabase-agent";
import { logAgentEvent } from "@/lib/pipeline-logs";
import { isAgentSupabaseReady } from "@/lib/agent-db";

const PROTECTED_TABLES = ["payments", "customers", "reservations"];

type WriteBody = {
  table?: string;
  action?: WriteAction;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  filters?: Record<string, unknown>;
  boss_confirmed?: boolean;
  delete_confirm?: string;
};

function checkWriteAuth(request: Request, body: WriteBody): string | null {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return "AGENT_WRITE_SECRET가 설정되지 않았습니다.";
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return "인증 실패: Authorization 헤더가 올바르지 않습니다.";
  }
  if (!body.boss_confirmed) return "boss_confirmed: true 필드가 필요합니다.";
  if (body.action === "delete" && body.delete_confirm !== "DELETE_CONFIRMED") {
    return 'delete 작업에는 delete_confirm: "DELETE_CONFIRMED" 필드가 필요합니다.';
  }
  return null;
}

export async function POST(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: WriteBody;
  try {
    body = (await request.json()) as WriteBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const authError = checkWriteAuth(request, body);
  if (authError) {
    const status = authError.includes("설정되지") ? 500 : authError.includes("인증") ? 401 : 403;
    return NextResponse.json({ error: authError }, { status });
  }

  const { table, action, payload, filters } = body;
  if (!table || !action) {
    return NextResponse.json({ error: "table, action 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: `허용되지 않은 테이블: ${table}` }, { status: 403 });
  }
  if (action === "delete" && PROTECTED_TABLES.includes(table)) {
    return NextResponse.json(
      { error: `${table} 테이블은 DELETE가 금지되어 있습니다.` },
      { status: 403 },
    );
  }

  const writeData: WriteData = { payload, filters };

  // before_snapshot: update/delete 시 현재 상태 기록 (복구용)
  if ((action === "update" || action === "delete") && filters) {
    const before = await executeQuery(table, { filters });
    await logAgentEvent("info", "agent-write", `before_snapshot: ${action} on ${table}`, {
      snapshot_type: "before", table, action, data: before.data,
    });
  }

  const result = await executeWrite(table, action, writeData);

  // after_snapshot: 실행 결과 기록
  await logAgentEvent("info", "agent-write", `after_snapshot: ${action} on ${table}`, {
    snapshot_type: "after", table, action,
    affected_rows: result.affected_rows, data: result.data,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ success: true, affected_rows: result.affected_rows });
}

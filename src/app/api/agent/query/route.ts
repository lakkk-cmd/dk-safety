import { NextResponse } from "next/server";
import { executeQuery } from "@/lib/supabase-agent";
import { isAgentSupabaseReady } from "@/lib/agent-db";

function checkReadAuth(request: Request): boolean {
  const secret = (process.env.AGENT_READ_SECRET?.trim() || process.env.AGENT_WRITE_SECRET?.trim()) ?? "";
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!checkReadAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: {
    table?: string;
    columns?: string | string[];
    filters?: Record<string, unknown>;
    orderBy?: string;
    limit?: number;
    ascending?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!body.table) {
    return NextResponse.json({ error: "table 파라미터가 필요합니다." }, { status: 400 });
  }

  const result = await executeQuery(body.table, {
    columns: body.columns,
    filters: body.filters,
    orderBy: body.orderBy,
    limit: body.limit,
    ascending: body.ascending,
  });

  if (result.error) {
    const status = result.error.includes("허용되지") ? 403 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ data: result.data, count: result.count });
}

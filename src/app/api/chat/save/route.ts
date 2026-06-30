import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

type MessageInput = {
  role: "user" | "assistant";
  content: string;
  tool_calls?: object;
};

type KeyDecisionInput = {
  category: "pricing" | "content" | "tech" | "strategy" | "legal";
  title: string;
  content: string;
};

type SaveBody = {
  session_id: string;
  messages: MessageInput[];
  summary?: string;
  key_decisions?: KeyDecisionInput[];
  completed_tasks?: string[];
  pending_tasks?: string[];
};

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { session_id, messages, summary, key_decisions, completed_tasks, pending_tasks } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id가 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages 배열이 비어있습니다." }, { status: 400 });
  }

  const supabase = requireAgentSupabase();
  const now = new Date().toISOString();

  // ① chat_messages 일괄 INSERT
  const messageRows = messages.map((m) => ({
    session_id,
    role: m.role,
    content: m.content,
    tool_calls: m.tool_calls ?? null,
    created_at: now,
  }));

  const { error: msgError } = await supabase.from("chat_messages").insert(messageRows);
  if (msgError) {
    return NextResponse.json(
      { error: `메시지 저장 실패: ${msgError.message}` },
      { status: 500 },
    );
  }

  // ② chat_sessions UPSERT
  const { error: sessionError } = await supabase.from("chat_sessions").upsert(
    {
      session_id,
      summary: summary ?? null,
      key_decisions: key_decisions ?? null,
      completed_tasks: completed_tasks ?? null,
      pending_tasks: pending_tasks ?? null,
      ended_at: now,
    },
    { onConflict: "session_id" },
  );
  if (sessionError) {
    return NextResponse.json(
      { error: `세션 저장 실패: ${sessionError.message}` },
      { status: 500 },
    );
  }

  // ③ key_decisions 테이블 INSERT
  let savedDecisions = 0;
  if (Array.isArray(key_decisions) && key_decisions.length > 0) {
    const decisionRows = key_decisions.map((d) => ({
      session_id,
      category: d.category,
      title: d.title,
      content: d.content,
      is_active: true,
    }));
    const { error: decError } = await supabase.from("key_decisions").insert(decisionRows);
    if (decError) {
      return NextResponse.json(
        { error: `의사결정 저장 실패: ${decError.message}` },
        { status: 500 },
      );
    }
    savedDecisions = decisionRows.length;
  }

  return NextResponse.json({
    success: true,
    session_id,
    saved_messages: messageRows.length,
    saved_decisions: savedDecisions,
  });
}

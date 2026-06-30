import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { extractJsonBlock } from "@/lib/agents";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

type MessageInput = { role: "user" | "assistant"; content: string };

type SummaryResult = {
  summary: string;
  key_decisions: Array<{
    category: "pricing" | "content" | "tech" | "strategy" | "legal";
    title: string;
    content: string;
  }>;
  completed_tasks: string[];
  pending_tasks: string[];
  context_snapshot: {
    last_topic?: string;
    next_action?: string;
    important_numbers?: string;
  };
};

async function callHaiku(messages: MessageInput[]): Promise<SummaryResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

  const transcript = messages
    .map((m) => `${m.role === "user" ? "대장" : "에이전트"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `당신은 대경이엔피(우리집 전기주치의) 사업 대화를 분석하는 요약 전문가입니다.
대화 내용을 분석해서 반드시 아래 JSON 형식으로만 응답하세요.
다른 텍스트는 절대 포함하지 마세요.`;

  const userPrompt = `아래 대화를 분석해서 JSON으로 요약하세요:

${transcript}

반환 형식:
{
  "summary": "3줄 이내 핵심 요약",
  "key_decisions": [
    { "category": "pricing|content|tech|strategy|legal", "title": "결정 제목", "content": "결정 내용" }
  ],
  "completed_tasks": ["완료된 작업1", "완료된 작업2"],
  "pending_tasks": ["미완료 작업1", "미완료 작업2"],
  "context_snapshot": {
    "last_topic": "마지막 대화 주제",
    "next_action": "다음에 할 일",
    "important_numbers": "중요한 수치나 날짜"
  }
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(`Anthropic API 오류: ${err.error?.message ?? res.status}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const rawText = data.content.find((b) => b.type === "text")?.text ?? "";

  try {
    return JSON.parse(extractJsonBlock(rawText)) as SummaryResult;
  } catch {
    // JSON 파싱 실패 시 raw 텍스트를 summary에 저장
    return {
      summary: rawText.slice(0, 500),
      key_decisions: [],
      completed_tasks: [],
      pending_tasks: [],
      context_snapshot: { last_topic: "파싱 실패", next_action: "", important_numbers: "" },
    };
  }
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: { session_id: string; messages: MessageInput[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { session_id, messages } = body;
  if (!session_id) return NextResponse.json({ error: "session_id가 필요합니다." }, { status: 400 });

  if (!Array.isArray(messages) || messages.length < 5) {
    return NextResponse.json({ success: true, skipped: true, reason: "대화가 너무 짧습니다" });
  }

  const result = await callHaiku(messages);
  const now = new Date().toISOString();
  const supabase = requireAgentSupabase();

  // ① chat_sessions UPSERT
  const { error: sessErr } = await supabase.from("chat_sessions").upsert(
    {
      session_id,
      summary: result.summary,
      key_decisions: result.key_decisions,
      completed_tasks: result.completed_tasks,
      pending_tasks: result.pending_tasks,
      context_snapshot: result.context_snapshot,
      ended_at: now,
    },
    { onConflict: "session_id" },
  );
  if (sessErr) {
    return NextResponse.json({ error: `세션 저장 실패: ${sessErr.message}` }, { status: 500 });
  }

  // ② key_decisions 테이블 INSERT
  let savedDecisions = 0;
  if (result.key_decisions.length > 0) {
    const rows = result.key_decisions.map((d) => ({
      session_id,
      category: d.category,
      title: d.title,
      content: d.content,
      is_active: true,
    }));
    const { error: decErr } = await supabase.from("key_decisions").insert(rows);
    if (decErr) {
      return NextResponse.json({ error: `결정사항 저장 실패: ${decErr.message}` }, { status: 500 });
    }
    savedDecisions = rows.length;
  }

  return NextResponse.json({
    success: true,
    session_id,
    summary: result.summary,
    key_decisions_count: savedDecisions,
    completed_tasks_count: result.completed_tasks.length,
    pending_tasks_count: result.pending_tasks.length,
  });
}

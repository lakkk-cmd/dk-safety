import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { CHAT_AGENT_GROUPS, CHAT_AGENTS, chatWithAgentPlus, loadChatHistory } from "@/lib/agent-chat";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { chatWithFullAgent } from "@/lib/full-agent";
import { GEMINI_ENABLED, validateAgentAnswer, validateRAGAnswer } from "@/lib/cross-validate";

export const maxDuration = 280;

/** 풀 에이전트(총괄) 답변만 동기적으로 Gemini 검토 — 심각한 오류는 안전 메시지로, 경미한 오류는 수정본으로 대체 */
async function reviewFullAgentAnswer(
  question: string,
  answer: string,
): Promise<{ reply: string; validation?: { score: number; passed: boolean; warnings: string[] } }> {
  if (!GEMINI_ENABLED || !question) return { reply: answer };
  try {
    const v = await validateAgentAnswer({ question, answer });
    let finalAnswer = answer;
    if (!v.passed && v.score < 50) {
      finalAnswer =
        "죄송합니다. 정확한 정보 제공을 위해 해당 질문은 전문가 확인이 필요합니다. 우리집 전기주치의(대경이엔피)에 직접 문의해 주세요.";
    } else if (!v.passed && v.correctedAnswer) {
      finalAnswer = v.correctedAnswer;
    }
    return { reply: finalAnswer, validation: { score: v.score, passed: v.passed, warnings: v.warnings } };
  } catch {
    return { reply: answer };
  }
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId")?.trim() || "cto";
  if (!CHAT_AGENTS.some((a) => a.id === agentId)) {
    return NextResponse.json({ message: `알 수 없는 에이전트: ${agentId}` }, { status: 400 });
  }

  try {
    const history = await loadChatHistory(agentId, 50);
    return NextResponse.json({ agents: CHAT_AGENTS, groups: CHAT_AGENT_GROUPS, history });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      agentId?: string;
      message?: string;
      attachmentUrl?: string;
      attachmentBase64?: string;
      attachmentType?: string;
      webSearch?: boolean;
    };
    const agentId = body.agentId?.trim();
    const message = body.message?.trim() ?? "";
    const attachmentUrl = body.attachmentUrl?.trim();
    const attachmentBase64 = body.attachmentBase64?.trim();
    if (!agentId || !CHAT_AGENTS.some((a) => a.id === agentId)) {
      return NextResponse.json({ message: `알 수 없는 에이전트: ${agentId}` }, { status: 400 });
    }
    if (!message && !attachmentUrl && !attachmentBase64) {
      return NextResponse.json({ message: "message 또는 첨부파일이 필요합니다." }, { status: 400 });
    }

    const attachment = attachmentBase64
      ? { base64: attachmentBase64, mediaType: body.attachmentType ?? "image/jpeg" }
      : attachmentUrl
      ? { url: attachmentUrl, mediaType: body.attachmentType ?? "application/octet-stream" }
      : undefined;

    if (agentId === "general") {
      if (attachment) {
        const reply = await chatWithAgentPlus("general", message, { attachment, webSearch: body.webSearch ?? false });
        const reviewed = await reviewFullAgentAnswer(message, reply);
        return NextResponse.json(reviewed);
      }
      const result = await chatWithFullAgent(message);
      const reviewed = await reviewFullAgentAnswer(message, result.reply);
      return NextResponse.json(reviewed);
    }

    const reply = await chatWithAgentPlus(agentId, message, {
      attachment,
      webSearch: body.webSearch ?? false,
    });

    // 비동기 교차검증 — 응답 지연 없음
    if (GEMINI_ENABLED && message) {
      void validateRAGAnswer({ question: message, answer: reply, chunks: [] }).catch(() => {});
    }

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "응답 생성 실패" },
      { status: 500 },
    );
  }
}

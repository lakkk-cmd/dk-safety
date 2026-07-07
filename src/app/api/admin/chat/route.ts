import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { appendChatMessage, CHAT_AGENT_GROUPS, CHAT_AGENTS, chatWithAgentPlus, loadChatHistory } from "@/lib/agent-chat";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { chatWithFullAgent } from "@/lib/full-agent";
import { GEMINI_ENABLED, validateAgentAnswer, validateRAGAnswer } from "@/lib/cross-validate";

export const maxDuration = 280;

type ChatBadge = "ok" | "no_evidence" | "corrected" | "blocked";
type ChatValidation = { score: number; passed: boolean; warnings: string[]; hasEvidence: boolean; evidenceSummary: string; badge: ChatBadge };

const BLOCKED_MESSAGE =
  "죄송합니다. 해당 질문에 대해 정확한 정보를 제공하기 어렵습니다.\n\n정확한 답변을 위해:\n1. 관련 자료를 지식베이스에 추가해 주세요\n2. 또는 전문가에게 직접 문의해 주세요\n\n📞 우리집 전기주치의(대경이엔피) 직접 문의: dkansim.com";

/**
 * 풀 에이전트(총괄) 답변만 동기적으로 Gemini 검토 — RAG 근거 여부를 함께 판단시켜, 명백한 거짓/위험
 * 오정보는 차단, 경미한 오류는 수정본으로 대체, 근거 없는 일반지식 답변은 배지로만 표시(차단 안 함).
 */
async function reviewFullAgentAnswer(
  question: string,
  answer: string,
  hasEvidence: boolean,
  evidenceSummary: string,
  executedToolsContext?: string,
): Promise<{ reply: string; validation: ChatValidation }> {
  const fallback: ChatValidation = {
    score: 0,
    passed: true,
    warnings: [],
    hasEvidence,
    evidenceSummary,
    badge: hasEvidence ? "ok" : "no_evidence",
  };
  if (!GEMINI_ENABLED || !question) return { reply: answer, validation: fallback };
  try {
    const v = await validateAgentAnswer({
      question,
      answer,
      // 에이전트가 이번 턴에 실제로 실행한 도구 내역 — "등록했습니다/조회했습니다" 같은 수행 보고를
      // 검증 불가능한 허위 정보로 오판(차단)하지 않도록 근거로 전달한다.
      context: executedToolsContext || undefined,
      hasRAGEvidence: hasEvidence || Boolean(executedToolsContext),
      includeProjectContext: true,
    });
    let finalAnswer = answer;
    let badge: ChatBadge = hasEvidence ? "ok" : "no_evidence";
    if (v.hasFalseInfo || v.hasDangerousMisinfo) {
      finalAnswer = BLOCKED_MESSAGE;
      badge = "blocked";
    } else if (!v.passed && v.correctedAnswer) {
      finalAnswer = v.correctedAnswer;
      badge = "corrected";
    }
    return {
      reply: finalAnswer,
      validation: { score: v.score, passed: v.passed, warnings: v.warnings, hasEvidence, evidenceSummary, badge },
    };
  } catch {
    return { reply: answer, validation: fallback };
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
        // chatWithAgentPlus는 내부적으로 자체 RAG(searchKnowledgeChunks)를 쓰지만 구조화된 근거
        // 정보를 반환하지 않으므로, 여기서는 근거 없음으로 간주해 검토한다.
        const reply = await chatWithAgentPlus("general", message, { attachment, webSearch: body.webSearch ?? false });
        const reviewed = await reviewFullAgentAnswer(message, reply, false, "");
        return NextResponse.json(reviewed);
      }
      const result = await chatWithFullAgent(message);
      const executedToolsContext = result.toolCalls.length
        ? `이번 턴에 에이전트가 실제로 실행 완료한 도구 호출 내역 (시스템이 기록한 사실 — 답변 속 수행 보고의 근거):\n${result.toolCalls
            .map((t) => `- ${t.name}(${JSON.stringify(t.input).slice(0, 200)})`)
            .join("\n")}`
        : "";
      const reviewed = await reviewFullAgentAnswer(
        message,
        result.reply,
        result.hasEvidence,
        result.evidenceSummary,
        executedToolsContext,
      );
      // chatWithFullAgent는 assistant 메시지를 저장하지 않는다 — Gemini 검토를 거친 최종 답변
      // (원본/수정본/차단 메시지)을 여기서 저장해야 대화 히스토리가 실제 화면과 일치한다.
      await appendChatMessage("general", "assistant", reviewed.reply);
      return NextResponse.json({ ...reviewed, pendingImprovement: result.pendingImprovement });
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

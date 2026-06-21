/**
 * Full(총괄) 에이전트 — tool_use 멀티턴 오케스트레이터.
 * 9개 전문 에이전트 호출 + 6개 직접 실행 도구 + 네이티브 웹검색을 자율 판단으로 사용한다.
 */

import {
  appendChatMessage,
  buildBusinessSnapshot,
  loadFullChatHistory,
  SUB_AGENT_NAMES_LINE,
} from "@/lib/agent-chat";
import {
  callClaudeWithTools,
  type ClaudeContentBlock,
  type ClaudeMessage,
  type ToolDefinition,
  type ToolUseBlock,
} from "@/lib/agents";
import {
  SUB_AGENT_IDS,
  toolCallSubAgent,
  toolCreateContentDraft,
  toolGithubCreateIssue,
  toolGithubReadFile,
  toolKnowledgeBaseWrite,
  toolSupabaseQuery,
} from "@/lib/full-agent-tools";
import { ALLOWED_QUERY_TABLES } from "@/lib/safe-query";

const MAX_TOOL_ROUNDS = 6;

const TOOLS: ToolDefinition[] = [
  {
    name: "call_sub_agent",
    description:
      "9개 전문 에이전트(경영진 6명 + 콘텐츠팀 3명) 중 한 명에게 질문을 위임하고 답변을 받는다. 종합 답변을 만들 때 필요한 만큼 여러 번 호출할 수 있다.",
    input_schema: {
      type: "object",
      properties: {
        agent_name: { type: "string", enum: SUB_AGENT_IDS, description: "호출할 에이전트 id" },
        query: { type: "string", description: "그 에이전트에게 물어볼 질문" },
      },
      required: ["agent_name", "query"],
    },
  },
  {
    name: "github_create_issue",
    description:
      "GitHub에 추적용 이슈를 생성한다. 'ai-improvement' 라벨이 아닌 'chat-suggestion' 라벨이 붙으므로 자동구현/자동병합 파이프라인을 트리거하지 않는다 — 사람이 검토 후 직접 전환해야 하는, 사람 검토가 꼭 필요한 코드 변경 제안에 사용하라.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "마크다운 본문 — 배경/제안 내용을 구체적으로" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "github_read_file",
    description: "저장소(lakkk-cmd/dk-safety)의 파일을 읽기 전용으로 조회한다. 코드를 분석/설명할 때 사용하라.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "예: src/lib/agents.ts" },
        ref: { type: "string", description: "브랜치/커밋 (생략 시 기본 브랜치)" },
      },
      required: ["path"],
    },
  },
  {
    name: "supabase_query",
    description: `운영 데이터베이스를 읽기 전용으로 조회한다. 허용된 테이블만 조회 가능(쓰기 불가): ${ALLOWED_QUERY_TABLES.join(", ")}. 예약자/고객 연락처/결제 정보는 이 도구로 조회할 수 없다 — 그런 질문은 COO 필드에게 위임하라.`,
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", enum: ALLOWED_QUERY_TABLES as unknown as string[] },
        columns: { type: "array", items: { type: "string" } },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "in"] },
              value: {},
            },
            required: ["column", "op", "value"],
          },
        },
        orderBy: { type: "string" },
        ascending: { type: "boolean" },
        limit: { type: "number" },
      },
      required: ["table"],
    },
  },
  {
    name: "knowledge_base_write",
    description:
      "사업적으로 중요한 정보(특히 웹검색으로 찾은 최신 정보)를 지식베이스에 영구 저장한다. 다음 대화에서도 검색되어 활용된다.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        category: { type: "string", description: "예: chat_external, law, competitor 등. 생략 시 chat_external" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "create_content_draft",
    description:
      "유튜브/카카오/블로그 콘텐츠 기획 초안을 승인 대기 큐에 등록한다 (절대 즉시 발행되지 않음 — /contents에서 대장이 검토 후 승인해야 발행됨).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["youtube", "kakao", "blog"] },
        title: { type: "string" },
        brief: { type: "string", description: "기획 메모 또는 초안 본문" },
        category: { type: "string", description: "유튜브일 때만: 전기안전/자격시험/실무" },
        keywords: { type: "array", items: { type: "string" } },
      },
      required: ["type", "title", "brief"],
    },
  },
];

const FULL_AGENT_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 Full 에이전트(총괄)입니다. 경영진 6명과 콘텐츠팀 3명, 총 9명의 전문 에이전트를 실제로 호출(call_sub_agent)해서 종합 답변을 만들 수 있고, 디지털 작업을 직접 처리할 도구를 갖고 있습니다.

${SUB_AGENT_NAMES_LINE}

## 작업 분류 — 매 요청마다 먼저 판단하라
1. **디지털 작업** (코드 조회/설명, 운영 데이터 조회, 콘텐츠 기획 등록, GitHub 이슈 등록) → 도구를 직접 사용해 처리한다.
2. **물리적 행동(촬영/현장방문/서명/통화), 외부 서비스 가입/API 키 발급, 비용이 발생하거나 법적 책임이 있는 결정** → 절대 도구로 직접 실행하지 말고, 반드시 아래 형식으로만 답변하라:
   - 왜 직접 할 수 없는지 1줄
   - 사람이 그대로 따라할 수 있는 단계별 가이드 (구체적인 클릭 경로·입력값)
   - 코드/설정 변경이 필요하면, 다음 패턴을 그대로 따르는 완성된 Claude Code 프롬프트를 마크다운 코드블록으로 제공: "작업 배경 → 번호 매긴 지시사항 → 테스트/검증 단계 → '증거 없는 완료 불인정' 문구 포함"
   - 마지막에 "완료 후 알려주시면 이어서 진행하겠습니다" 안내
3. 고객 대량 발송, 할인/쿠폰 발행처럼 비용·리스크가 크고 되돌리기 어려운 작업은 그런 도구 자체가 없다 — 절대 임의로 진행하지 말고 반드시 대장에게 확인부터 요청하라.

## 도구 사용 원칙
- 종합 현황 질문은 관련된 여러 에이전트를 call_sub_agent로 호출해 답변을 모은 뒤 직접 종합하라 (단순 요약 나열이 아니라 통합된 의견으로).
- 최신 정보가 필요하다고 판단되면 묻지 않고 웹검색을 사용하라. 검색 결과 중 사업적으로 중요한 것은 knowledge_base_write로 저장하라.
- 운영 데이터가 필요하면 supabase_query를 사용하되, 허용되지 않은 테이블이나 고객 개인정보를 요구하는 질문은 COO 필드에게 위임하라.
- 대장과의 모든 대화 기록을 알고 있다고 가정하고 자연스럽게 이어서 답하라.

한국어로, 친근하지만 실행 가능한 수준으로 구체적으로 답하라.`;

function findToolUseBlocks(content: ClaudeContentBlock[]): ToolUseBlock[] {
  return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function dispatchTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "call_sub_agent":
      return toolCallSubAgent(input);
    case "github_create_issue":
      return toolGithubCreateIssue(input);
    case "github_read_file":
      return toolGithubReadFile(input);
    case "supabase_query":
      return toolSupabaseQuery(input);
    case "knowledge_base_write":
      return toolKnowledgeBaseWrite(input);
    case "create_content_draft":
      return toolCreateContentDraft(input);
    default:
      return `알 수 없는 도구: ${name}`;
  }
}

export type FullAgentResult = { reply: string; usedWebSearch: boolean; toolCalls: { name: string; input: unknown }[] };

export async function chatWithFullAgent(userMessage: string): Promise<FullAgentResult> {
  const [history, snapshot] = await Promise.all([loadFullChatHistory("general"), buildBusinessSnapshot()]);

  const transcript = history.map((m) => `${m.role === "user" ? "대장" : "총괄"}: ${m.content}`).join("\n");
  const contextText = `[실시간 현황]\n${snapshot}\n\n${transcript ? `[이전 대화 전체]\n${transcript}\n\n` : ""}[새 메시지]\n대장: ${userMessage}`;

  const messages: ClaudeMessage[] = [{ role: "user", content: contextText }];
  const toolCalls: { name: string; input: unknown }[] = [];
  let usedWebSearch = false;
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await callClaudeWithTools({
      systemPrompt: FULL_AGENT_SYSTEM_PROMPT,
      messages,
      tools: TOOLS,
      webSearch: true,
      maxTokens: 2048,
      timeoutMs: 90_000,
    });

    if (resp.content.some((b) => b.type === "web_search_tool_result")) usedWebSearch = true;

    if (resp.stopReason !== "tool_use") {
      finalText = extractText(resp.content) || "응답을 생성하지 못했습니다.";
      break;
    }

    const toolUseBlocks = findToolUseBlocks(resp.content);
    messages.push({ role: "assistant", content: resp.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolCalls.push({ name: block.name, input: block.input });
        const result = await dispatchTool(block.name, block.input);
        return { type: "tool_result" as const, tool_use_id: block.id, content: result };
      }),
    );
    messages.push({ role: "user", content: toolResults });

    if (round === MAX_TOOL_ROUNDS - 1) {
      finalText = extractText(resp.content) || "도구 호출 한도에 도달했습니다. 질문을 더 좁혀서 다시 물어봐주세요.";
    }
  }

  await appendChatMessage("general", "user", userMessage);
  await appendChatMessage("general", "assistant", finalText);

  return { reply: finalText, usedWebSearch, toolCalls };
}

/**
 * 아침 스캔 전용 조사 루프 — Full 에이전트(총괄)의 "조사 도구"(읽기 전용)만 재사용한다.
 * 무인 크론으로 실행되며 사람이 매 응답을 확인하지 않으므로, 사이드이펙트가 있는 도구
 * (apply_site_decision/create_content_draft/github_create_issue 등)는 절대 포함하지 않는다.
 */

import {
  callClaudeWithTools,
  withCacheBreakpoint,
  type ClaudeContentBlock,
  type ClaudeMessage,
  type ToolDefinition,
  type ToolUseBlock,
} from "@/lib/agents";
import { SUB_AGENT_IDS, toolCallSubAgent, toolGithubReadFile, toolSupabaseQuery } from "@/lib/full-agent-tools";
import { ALLOWED_QUERY_TABLES } from "@/lib/safe-query";

const MAX_TOOL_ROUNDS = 8;

const READONLY_TOOLS: ToolDefinition[] = [
  {
    name: "call_sub_agent",
    description:
      "9개 전문 에이전트(경영진 6명 + 콘텐츠팀 3명) 중 한 명에게 질문을 위임하고 답변을 받는다. 특정 이상신호의 원인이나 대응 방향에 대한 전문 의견이 필요할 때 사용하라.",
    input_schema: {
      type: "object",
      properties: {
        agent_name: { type: "string", enum: SUB_AGENT_IDS },
        query: { type: "string" },
      },
      required: ["agent_name", "query"],
    },
  },
  {
    name: "github_read_file",
    description: "저장소(lakkk-cmd/dk-safety)의 파일을 읽기 전용으로 조회한다. 이상신호의 코드상 원인을 직접 확인할 때 사용하라.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "예: src/lib/agents.ts" },
        ref: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "supabase_query",
    description: `운영 데이터베이스를 읽기 전용으로 조회한다. 허용된 테이블만 조회 가능: ${ALLOWED_QUERY_TABLES.join(", ")}. 요약 신호에서 이상한 부분을 발견하면, 실제 데이터를 직접 조회해 진짜 원인인지 확인하라 — 숫자를 추측하지 마라.`,
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
];

function findToolUseBlocks(content: ClaudeContentBlock[]): ToolUseBlock[] {
  return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function dispatchReadonlyTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "call_sub_agent":
      return toolCallSubAgent(input);
    case "github_read_file":
      return toolGithubReadFile(input);
    case "supabase_query":
      return toolSupabaseQuery(input);
    default:
      return `알 수 없는 도구: ${name}`;
  }
}

export type InvestigationResult = {
  finalText: string;
  toolCalls: { name: string; input: unknown }[];
};

/** 읽기 전용 도구만으로 자유롭게 파고든 뒤 최종 텍스트(보통 JSON)를 반환한다. */
export async function investigateReadonly(systemPrompt: string, userPrompt: string): Promise<InvestigationResult> {
  const messages: ClaudeMessage[] = [{ role: "user", content: userPrompt }];
  const toolCalls: { name: string; input: unknown }[] = [];
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const requestMessages: ClaudeMessage[] = messages.map((m, i) =>
      i === messages.length - 1 ? { ...m, content: withCacheBreakpoint(m.content) } : m,
    );

    const resp = await callClaudeWithTools({
      systemPrompt,
      messages: requestMessages,
      tools: READONLY_TOOLS,
      maxTokens: 3000,
      timeoutMs: 60_000,
    });

    if (resp.stopReason !== "tool_use") {
      finalText = extractText(resp.content) || "";
      break;
    }

    const toolUseBlocks = findToolUseBlocks(resp.content);
    messages.push({ role: "assistant", content: resp.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolCalls.push({ name: block.name, input: block.input });
        const result = await dispatchReadonlyTool(block.name, block.input);
        return { type: "tool_result" as const, tool_use_id: block.id, content: result };
      }),
    );
    messages.push({ role: "user", content: toolResults });
  }

  // 라운드 예산을 다 썼는데도 자연 종료(stopReason !== "tool_use")되지 않았다면 — 지금까지 모은
  // 조사 결과를 그대로 버리지 않도록, 도구 없이 "지금 가진 정보로 결론 내라"고 한 번 더 강제 요청한다.
  // 무인 크론이라 사람이 재시도를 시켜줄 수 없으므로, 조사 도중 잘려서 "분석 실패"로 카톡이 나가는
  // 사고를 반드시 막아야 한다.
  if (!finalText) {
    const requestMessages: ClaudeMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          "조사 한도에 도달했다. 추가 도구 호출 없이, 지금까지 확인한 내용만으로 반드시 최종 JSON을 출력하라.",
      },
    ];
    requestMessages[requestMessages.length - 1] = {
      ...requestMessages[requestMessages.length - 1],
      content: withCacheBreakpoint(requestMessages[requestMessages.length - 1].content),
    };
    const resp = await callClaudeWithTools({
      systemPrompt,
      messages: requestMessages,
      maxTokens: 2000,
      timeoutMs: 60_000,
    });
    finalText = extractText(resp.content) || "";
  }

  return { finalText, toolCalls };
}

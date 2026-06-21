/** Full(총괄) 에이전트가 호출하는 6개 도구의 실행부. 각 도구는 기존 함수를 얇게 감싸 재사용한다. */

import { chatWithAgentPlus, CHAT_AGENTS } from "@/lib/agent-chat";
import { requireAgentSupabase } from "@/lib/agent-db";
import { createBlogPost } from "@/lib/blog-store";
import type { ContentCategory } from "@/lib/content-agents";
import { embedText } from "@/lib/embeddings";
import { createGithubIssue, readGithubFile } from "@/lib/github-issues";
import { ALLOWED_QUERY_TABLES, runSafeQuery, type QueryFilter } from "@/lib/safe-query";

export const SUB_AGENT_IDS = CHAT_AGENTS.filter((a) => a.id !== "general").map((a) => a.id);

export async function toolCallSubAgent(args: { agent_name?: string; query?: string }): Promise<string> {
  const agentId = args.agent_name?.trim();
  const query = args.query?.trim();
  if (!agentId || !SUB_AGENT_IDS.includes(agentId)) {
    return `오류: agent_name은 다음 중 하나여야 합니다: ${SUB_AGENT_IDS.join(", ")}`;
  }
  if (!query) return "오류: query가 필요합니다.";
  const reply = await chatWithAgentPlus(agentId, `[Full 위임 질문] ${query}`);
  return reply;
}

export async function toolGithubCreateIssue(args: { title?: string; body?: string }): Promise<string> {
  const title = args.title?.trim();
  const body = args.body?.trim();
  if (!title || !body) return "오류: title과 body가 모두 필요합니다.";
  try {
    const issue = await createGithubIssue({
      title,
      body: `${body}\n\n---\n_이 이슈는 Full 에이전트(총괄) 채팅에서 생성되었습니다. 자동 구현 파이프라인을 트리거하지 않는 별도 라벨(chat-suggestion)이 붙어 있어, 검토 후 필요하면 대장이 직접 ai-improvement로 전환해야 합니다._`,
      labels: ["chat-suggestion"],
    });
    return `이슈 생성 완료: ${issue.url} (#${issue.number})`;
  } catch (err) {
    return `이슈 생성 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function toolGithubReadFile(args: { path?: string; ref?: string }): Promise<string> {
  const path = args.path?.trim();
  if (!path) return "오류: path가 필요합니다.";
  try {
    return await readGithubFile(path, args.ref?.trim());
  } catch (err) {
    return `파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function toolSupabaseQuery(args: {
  table?: string;
  columns?: string[];
  filters?: QueryFilter[];
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
}): Promise<string> {
  if (!args.table) return `오류: table이 필요합니다. 허용 목록: ${ALLOWED_QUERY_TABLES.join(", ")}`;
  const result = await runSafeQuery({
    table: args.table,
    columns: args.columns,
    filters: args.filters,
    orderBy: args.orderBy,
    ascending: args.ascending,
    limit: args.limit,
  });
  if ("error" in result) return `조회 실패: ${result.error}`;
  return JSON.stringify(result.rows);
}

export async function toolKnowledgeBaseWrite(args: {
  title?: string;
  content?: string;
  category?: string;
}): Promise<string> {
  const title = args.title?.trim();
  const content = args.content?.trim();
  if (!title || !content) return "오류: title과 content가 모두 필요합니다.";
  const category = args.category?.trim() || "chat_external";
  try {
    const embedding = await embedText(`${title}\n${content}`);
    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("knowledge_base").insert({
      source: "full_agent_chat",
      title,
      content,
      embedding,
      category,
      is_external: true,
    });
    if (error) return `지식베이스 저장 실패: ${error.message}`;
    return `지식베이스에 저장됨 (category: ${category})`;
  } catch (err) {
    return `지식베이스 저장 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const CONTENT_DRAFT_TYPES = ["youtube", "kakao", "blog"] as const;

export async function toolCreateContentDraft(args: {
  type?: string;
  title?: string;
  brief?: string;
  category?: string;
  keywords?: string[];
}): Promise<string> {
  const type = args.type?.trim();
  const title = args.title?.trim();
  const brief = args.brief?.trim();
  if (!type || !(CONTENT_DRAFT_TYPES as readonly string[]).includes(type)) {
    return `오류: type은 ${CONTENT_DRAFT_TYPES.join("/")} 중 하나여야 합니다.`;
  }
  if (!title || !brief) return "오류: title과 brief가 모두 필요합니다.";

  try {
    const supabase = requireAgentSupabase();
    if (type === "youtube") {
      const { data, error } = await supabase
        .from("content_youtube_queue")
        .insert({
          title,
          competitor_notes: brief,
          category: (args.category as ContentCategory | undefined) ?? "전기안전",
          status: "planning",
        })
        .select("id")
        .single();
      if (error) throw error;
      return `유튜브 기획 큐에 등록됨 (id: ${(data as { id: string }).id}, status: planning) — /contents에서 승인 대기 중`;
    }
    if (type === "kakao") {
      const { data, error } = await supabase
        .from("content_kakao_queue")
        .insert({ title, content: brief, status: "planning" })
        .select("id")
        .single();
      if (error) throw error;
      return `카카오 기획 큐에 등록됨 (id: ${(data as { id: string }).id}, status: planning) — /contents에서 승인 대기 중`;
    }
    const post = await createBlogPost({
      title,
      content: brief,
      keywords: args.keywords ?? [],
      agentSource: "Full 에이전트",
      status: "draft",
    });
    return `블로그 초안 등록됨 (id: ${post.id}, status: draft) — /contents에서 승인 대기 중`;
  } catch (err) {
    return `콘텐츠 초안 등록 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}

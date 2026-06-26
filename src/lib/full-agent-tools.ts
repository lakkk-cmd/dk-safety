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

// ─── 신규 API 래퍼 도구 (에이전트 자율 실행용) ─────────────────────────────────

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

function writeHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.AGENT_WRITE_SECRET ?? ""}`,
  };
}

function readHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.AGENT_READ_SECRET ?? process.env.AGENT_WRITE_SECRET ?? ""}`,
  };
}

export async function queryDB(table: string, options: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE_URL}/api/agent/query`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ table, ...options }),
  });
  if (!res.ok) throw new Error(`queryDB error: ${res.status}`);
  return res.json() as Promise<{ data: unknown[]; count: number }>;
}

export async function writeDB(
  table: string,
  action: "insert" | "update" | "delete",
  payload: Record<string, unknown>,
  filters?: Record<string, unknown>,
) {
  const res = await fetch(`${BASE_URL}/api/agent/write`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ table, action, payload, filters, boss_confirmed: true }),
  });
  if (!res.ok) throw new Error(`writeDB error: ${res.status}`);
  return res.json() as Promise<{ success: boolean; affected_rows: number }>;
}

export async function sendKakao(type: "alimtalk" | "channel_post", params: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/kakao/send`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ type, ...params, boss_confirmed: true }),
  });
  if (!res.ok) throw new Error(`sendKakao error: ${res.status}`);
  return res.json();
}

export async function uploadYoutube(videoUrl: string, metadata: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}/api/youtube/upload`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ videoUrl, ...metadata, boss_confirmed: true }),
  });
  if (!res.ok) throw new Error(`uploadYoutube error: ${res.status}`);
  return res.json() as Promise<{ success: boolean; videoId: string }>;
}

export async function getYoutubeAnalytics(videoId?: string, from?: string, to?: string) {
  const params = new URLSearchParams();
  if (videoId) params.set("videoId", videoId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${BASE_URL}/api/youtube/analytics?${params.toString()}`, {
    headers: readHeaders(),
  });
  if (!res.ok) throw new Error(`getYoutubeAnalytics error: ${res.status}`);
  return res.json();
}

export async function publishBlog(
  title: string,
  content: string,
  tags: string[],
  category: string,
  scheduledAt?: string,
) {
  const res = await fetch(`${BASE_URL}/api/blog/publish`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ title, content, tags, category, scheduledAt, boss_confirmed: true }),
  });
  if (!res.ok) throw new Error(`publishBlog error: ${res.status}`);
  return res.json() as Promise<{ success: boolean; postId: string }>;
}

export async function sendSMS(
  to: string | string[],
  text: string,
  type: "sms" | "lms" = "sms",
  title?: string,
) {
  const res = await fetch(`${BASE_URL}/api/sms/send`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ to, text, type, title }),
  });
  if (!res.ok) throw new Error(`sendSMS error: ${res.status}`);
  return res.json();
}

export async function getRevenue(type: "daily" | "monthly" | "range", from?: string, to?: string) {
  const params = new URLSearchParams({ type });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`${BASE_URL}/api/toss/revenue?${params.toString()}`, {
    headers: readHeaders(),
  });
  if (!res.ok) throw new Error(`getRevenue error: ${res.status}`);
  return res.json() as Promise<{ total: number; count: number; average: number; list: unknown[] }>;
}

export async function writeGithubFile(path: string, content: string, message: string, branch?: string) {
  const res = await fetch(`${BASE_URL}/api/github/write`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify({ path, content, message, branch }),
  });
  if (!res.ok) throw new Error(`writeGithubFile error: ${res.status}`);
  return res.json() as Promise<{ success: boolean; sha: string; url: string }>;
}

export async function getBlogStats(postId?: string) {
  const params = postId ? `?postId=${postId}` : "";
  const res = await fetch(`${BASE_URL}/api/blog/stats${params}`, {
    headers: readHeaders(),
  });
  if (!res.ok) throw new Error(`getBlogStats error: ${res.status}`);
  return res.json();
}

export async function getAgentStatus() {
  const res = await fetch(`${BASE_URL}/api/agent/status`, { headers: readHeaders() });
  if (!res.ok) throw new Error(`getAgentStatus error: ${res.status}`);
  return res.json();
}

export async function toolApplySiteDecision(args: {
  decisions?: Array<{
    decision_type: string;
    target_page: string;
    key: string;
    value: string;
    label?: string;
  }>;
  session_id?: string;
}): Promise<string> {
  const decisions = args.decisions;
  const session_id = args.session_id?.trim() || `agent-${Date.now()}`;
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return "오류: decisions 배열이 필요합니다.";
  }
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/chat/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "dk_admin_auth=ok" },
      body: JSON.stringify({ session_id, decisions }),
      cache: "no-store",
    });
    const data = (await res.json()) as { success?: boolean; applied_count?: number; applied?: { key: string; new_value: string; target_page: string }[]; error?: string };
    if (!data.success) return `반영 실패: ${data.error ?? "알 수 없는 오류"}`;
    const summary = (data.applied ?? []).map((a) => `${a.key}=${a.new_value} (${a.target_page})`).join(", ");
    return `✅ [반영 완료] ${data.applied_count}건 → dkansim.com에 즉시 적용됐습니다. (${summary})`;
  } catch (e) {
    return `반영 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

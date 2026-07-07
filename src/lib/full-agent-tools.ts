/** Full(총괄) 에이전트가 호출하는 6개 도구의 실행부. 각 도구는 기존 함수를 얇게 감싸 재사용한다. */

import { chatWithAgentPlus, CHAT_AGENTS } from "@/lib/agent-chat";
import { requireAgentSupabase } from "@/lib/agent-db";
import { createBlogPost } from "@/lib/blog-store";
import type { ContentCategory } from "@/lib/content-agents";
import { embedText } from "@/lib/embeddings";
import { createGithubIssue, readGithubFile } from "@/lib/github-issues";
import { createChatImprovementRequest } from "@/lib/improvement-requests";
import { ALLOWED_QUERY_TABLES, runSafeQuery, type QueryFilter } from "@/lib/safe-query";
import { DOC_TEMPLATES, generateDocument } from "@/lib/document-generator";

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

export type GithubCreateIssueResult = {
  message: string;
  pendingImprovement?: { requestId: string; issueNumber: number };
};

export async function toolGithubCreateIssue(args: {
  title?: string;
  body?: string;
  auto_implement?: boolean;
}): Promise<GithubCreateIssueResult> {
  const title = args.title?.trim();
  const body = args.body?.trim();
  if (!title || !body) return { message: "오류: title과 body가 모두 필요합니다." };
  const autoImplement = args.auto_implement === true;
  try {
    const issue = await createGithubIssue({
      title,
      body: autoImplement
        ? `${body}\n\n---\n_이 이슈는 Full 에이전트(총괄) 채팅에서 생성되었으며, 에이전트가 저위험 변경으로 판단해 'ai-improvement' 라벨을 붙여 자동 구현/자동병합 파이프라인이 즉시 시작됩니다. lint/build 통과 시 사람 검토 없이 프로덕션에 배포될 수 있습니다._`
        : `${body}\n\n---\n_이 이슈는 Full 에이전트(총괄) 채팅에서 생성되었습니다. 자동 구현 파이프라인을 트리거하지 않는 별도 라벨(chat-suggestion)이 붙어 있어, 검토 후 필요하면 대장이 직접 ai-improvement로 전환해야 합니다._`,
      labels: [autoImplement ? "ai-improvement" : "chat-suggestion"],
    });

    if (!autoImplement) {
      return { message: `이슈 생성 완료: ${issue.url} (#${issue.number})` };
    }

    // 자동구현 경로만 진행상황 추적 테이블에 연결한다 — chat-suggestion은 사람이 라벨을 바꿔야
    // 파이프라인이 시작되므로 실시간 진행상황이 존재하지 않는다.
    try {
      const tracked = await createChatImprovementRequest({
        title,
        body,
        githubIssueUrl: issue.url,
        githubIssueNumber: issue.number,
      });
      return {
        message: `이슈 생성 완료 (자동구현 시작됨): ${issue.url} (#${issue.number}) — Claude Code가 바로 구현에 들어갑니다. lint/build 통과 시 사람 검토 없이 자동 머지·배포됩니다.`,
        pendingImprovement: { requestId: tracked.id, issueNumber: issue.number },
      };
    } catch {
      // 추적 레코드 생성 실패는 파이프라인 자체(GitHub 라벨 기반)에는 영향 없음 — 진행상황 카드만 못 띄움
      return {
        message: `이슈 생성 완료 (자동구현 시작됨): ${issue.url} (#${issue.number}) — Claude Code가 바로 구현에 들어갑니다. lint/build 통과 시 사람 검토 없이 자동 머지·배포됩니다.`,
      };
    }
  } catch (err) {
    return { message: `이슈 생성 실패: ${err instanceof Error ? err.message : String(err)}` };
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

const DOC_TYPE_IDS = Object.keys(DOC_TEMPLATES).filter((id) => id !== "custom");

export async function toolGenerateDocument(args: {
  doc_type?: string;
  user_request?: string;
  customer_name?: string;
  reservation_id?: string;
}): Promise<string> {
  const docType = args.doc_type?.trim();
  const userRequest = args.user_request?.trim();
  if (!docType || !DOC_TYPE_IDS.includes(docType)) {
    return `오류: doc_type은 다음 중 하나여야 합니다: ${DOC_TYPE_IDS.join(", ")}`;
  }
  if (!userRequest) return "오류: user_request가 필요합니다.";

  try {
    const result = await generateDocument({
      docType,
      userRequest,
      customerName: args.customer_name?.trim() || undefined,
      reservationId: args.reservation_id?.trim() || undefined,
    });
    const links = [
      result.pdfUrl ? `PDF: ${result.pdfUrl}` : null,
      result.docxUrl ? `Word: ${result.docxUrl}` : null,
    ].filter(Boolean).join("\n");
    return `문서 생성 완료: "${result.title}" (검증 점수: ${result.validationScore}점)\n${links || "(다운로드 파일 생성 실패 — 본문만 저장됨)"}\n\n---\n${result.content}`;
  } catch (err) {
    return `문서 생성 실패: ${err instanceof Error ? err.message : String(err)}`;
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
    const data = (await res.json()) as {
      success?: boolean;
      applied_count?: number;
      applied?: { key: string; new_value: string; target_page: string }[];
      warnings?: string[];
      error?: string;
    };
    if (!data.success) return `반영 실패: ${data.error ?? "알 수 없는 오류"}`;
    const summary = (data.applied ?? []).map((a) => `${a.key}=${a.new_value} (${a.target_page})`).join(", ");
    const warningsText = data.warnings && data.warnings.length > 0
      ? `\n⚠️ 일부 항목은 완전히 반영되지 않았습니다:\n${data.warnings.map((w) => `- ${w}`).join("\n")}`
      : "";
    return `✅ [반영 완료] ${data.applied_count}건 → dkansim.com에 즉시 적용됐습니다. (${summary})${warningsText}`;
  } catch (e) {
    return `반영 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─── dk-video-factory 영상 제작 도구 (7단계) ──────────────────────────────────

const VIDEO_JOB_FORMATS = ["shorts", "standard"] as const;

const VIDEO_JOB_STATUS_LABELS: Record<string, string> = {
  queued: "대기 중 (로컬 워커가 아직 집어가지 않음)",
  scripting: "대본 생성 중",
  rendering: "렌더링 중",
  pending_review: "렌더링 완료 — 대장 승인 대기 (hq.dkansim.com/videos)",
  approved: "승인됨 — 유튜브 업로드 대기",
  uploading: "유튜브 업로드 중",
  published: "유튜브 업로드 완료 (비공개)",
  rejected: "반려됨",
  error: "오류로 중단됨",
};

/** 영상 제작 작업을 video_jobs 큐에 등록 — 로컬 워커가 대본→TTS→렌더링을 처리하고 대장 승인 후에만 업로드된다 */
export async function toolCreateVideoJob(args: {
  topic?: string;
  format?: string;
  script?: unknown;
}): Promise<string> {
  const topic = args.topic?.trim();
  if (!topic) return "오류: topic(영상 주제)이 필요합니다.";
  const format = (VIDEO_JOB_FORMATS as readonly string[]).includes(args.format ?? "")
    ? (args.format as string)
    : "shorts";

  try {
    const supabase = requireAgentSupabase();
    const row: Record<string, unknown> = { requested_by: "orchestrator", topic, format };
    if (args.script && typeof args.script === "object") row.script = args.script;
    const { data, error } = await supabase.from("video_jobs").insert(row).select("id").single();
    if (error) throw error;
    const jobId = (data as { id: string }).id;
    return (
      `✅ 영상 제작 작업 등록됨 (job_id: ${jobId}, format: ${format})\n` +
      `처리 흐름: 로컬 워커 PC가 켜져 있으면 60초 내에 집어가 대본 생성→TTS→렌더링을 진행하고, ` +
      `완료되면 대장에게 카카오 검토 알림이 갑니다. 대장이 hq.dkansim.com/videos에서 승인해야만 유튜브에 업로드됩니다 (즉시 게시 아님). ` +
      `진행 상황은 get_video_job(job_id)로 확인할 수 있습니다.`
    );
  } catch (e) {
    return `영상 작업 등록 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 영상 제작 작업 상태 조회 */
export async function toolGetVideoJob(args: { job_id?: string }): Promise<string> {
  const jobId = args.job_id?.trim();
  if (!jobId) return "오류: job_id가 필요합니다.";
  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("video_jobs")
      .select("topic, format, status, video_path, youtube_url, review_note, error, created_at")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return `해당 job_id의 작업을 찾을 수 없습니다: ${jobId}`;
    const job = data as {
      topic: string; format: string; status: string; video_path: string | null;
      youtube_url: string | null; review_note: string | null; error: string | null; created_at: string;
    };
    const lines = [
      `영상 작업 상태 (${jobId})`,
      `- 주제: ${job.topic} [${job.format}]`,
      `- 상태: ${job.status} — ${VIDEO_JOB_STATUS_LABELS[job.status] ?? ""}`,
    ];
    if (job.video_path) lines.push(`- 미리보기: ${job.video_path}`);
    if (job.youtube_url) lines.push(`- 유튜브: ${job.youtube_url}`);
    if (job.review_note) lines.push(`- 반려 사유: ${job.review_note}`);
    if (job.error) lines.push(`- 오류: ${job.error}`);
    return lines.join("\n");
  } catch (e) {
    return `영상 작업 조회 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─── dk-blog-factory 블로그 제작 도구 (6단계) ─────────────────────────────────

const BLOG_JOB_STATUS_LABELS: Record<string, string> = {
  queued: "대기 중 (로컬 워커가 아직 집어가지 않음)",
  researching: "키워드 조사 중",
  drafting: "원고 작성 중",
  processing_images: "사진/썸네일 처리 중",
  pending_review: "발행 패키지 완성 — 대장 수동 발행 대기 (hq.dkansim.com/blog-jobs)",
  published: "네이버 발행 완료",
  rejected: "반려됨",
  error: "오류로 중단됨",
};

/** 네이버 블로그 원고 제작 작업을 blog_jobs 큐에 등록 — 발행은 반드시 대장이 수동 수행 */
export async function toolCreateBlogJob(args: {
  topic?: string;
  seed_keywords?: string[];
  raw_image_paths?: string[];
}): Promise<string> {
  const topic = args.topic?.trim();
  if (!topic) return "오류: topic(글 주제)이 필요합니다.";

  try {
    const supabase = requireAgentSupabase();
    const row: Record<string, unknown> = { requested_by: "orchestrator", topic };
    if (Array.isArray(args.seed_keywords) && args.seed_keywords.length > 0) {
      row.seed_keywords = args.seed_keywords.map((s) => String(s).trim()).filter(Boolean);
    }
    if (Array.isArray(args.raw_image_paths) && args.raw_image_paths.length > 0) {
      row.raw_image_paths = args.raw_image_paths.map((s) => String(s).trim()).filter(Boolean);
    }
    const { data, error } = await supabase.from("blog_jobs").insert(row).select("id").single();
    if (error) throw error;
    const jobId = (data as { id: string }).id;
    return (
      `✅ 블로그 원고 제작 작업 등록됨 (job_id: ${jobId})\n` +
      `처리 흐름: 로컬 워커 PC가 켜져 있으면 60초 내에 집어가 키워드 조사→원고 작성→검증→사진/썸네일까지 자동 처리하고, ` +
      `완성되면 대장에게 카카오 알림이 갑니다. 네이버 발행은 자동화가 불가능(정책 위반)하므로 반드시 대장이 hq.dkansim.com/blog-jobs에서 패키지를 받아 직접 발행합니다. ` +
      `진행 상황은 get_blog_job(job_id)로 확인할 수 있습니다.`
    );
  } catch (e) {
    return `블로그 작업 등록 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 블로그 제작 작업 상태 조회 */
export async function toolGetBlogJob(args: { job_id?: string }): Promise<string> {
  const jobId = args.job_id?.trim();
  if (!jobId) return "오류: job_id가 필요합니다.";
  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("blog_jobs")
      .select("topic, status, draft, validation, published_url, review_note, error, created_at")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return `해당 job_id의 작업을 찾을 수 없습니다: ${jobId}`;
    const job = data as {
      topic: string; status: string; draft: { title?: string } | null;
      validation: { score?: number } | null; published_url: string | null;
      review_note: string | null; error: string | null; created_at: string;
    };
    const lines = [
      `블로그 작업 상태 (${jobId})`,
      `- 주제: ${job.topic}`,
      `- 상태: ${job.status} — ${BLOG_JOB_STATUS_LABELS[job.status] ?? ""}`,
    ];
    if (job.draft?.title) lines.push(`- 원고 제목: ${job.draft.title}`);
    if (typeof job.validation?.score === "number") lines.push(`- 검증 점수: ${job.validation.score}점`);
    if (job.published_url) lines.push(`- 발행 URL: ${job.published_url}`);
    if (job.review_note) lines.push(`- 반려 사유: ${job.review_note}`);
    if (job.error) lines.push(`- 오류: ${job.error}`);
    return lines.join("\n");
  } catch (e) {
    return `블로그 작업 조회 실패: ${e instanceof Error ? e.message : String(e)}`;
  }
}

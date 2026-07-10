import { requireAgentSupabase } from "@/lib/agent-db";
import { appendToRaw } from "@/lib/append-to-raw";

// dk-blog-factory 발행 패키지 (blog_jobs, migration 064) — 워커가 생산한
// 원고/보정사진/썸네일을 대장이 hq에서 받아 네이버 에디터에 수동 발행한다.
// 자동 발행 경로는 존재하지 않는다 (네이버 정책) — 사람 발행이 곧 승인 게이트.

export type BlogJobStatus =
  | "queued"
  | "researching"
  | "drafting"
  | "processing_images"
  | "pending_review"
  | "published"
  | "rejected"
  | "error";

export type BlogJobSection = {
  heading: string;
  body: string;
  image_marker?: string | null;
};

export type BlogJob = {
  id: string;
  created_at: string;
  requested_by: string;
  topic: string;
  seed_keywords: string[] | null;
  keyword_research: {
    source?: string;
    main?: string;
    volume?: number;
    competition?: string;
    sub?: { keyword: string; volume: number; competition: string }[];
    questions?: string[];
  } | null;
  draft: {
    title?: string;
    sections?: BlogJobSection[];
    tags?: string[];
    meta?: Record<string, unknown>;
  } | null;
  processed_images: string[] | null;
  thumbnail_url: string | null;
  validation: { score?: number; issues?: unknown[] } | null;
  status: BlogJobStatus;
  review_note: string | null;
  published_url: string | null;
  error: string | null;
};

const COLUMNS =
  "id, created_at, requested_by, topic, seed_keywords, keyword_research, draft, processed_images, thumbnail_url, validation, status, review_note, published_url, error";

export async function listBlogJobs(limit = 30): Promise<BlogJob[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_jobs")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BlogJob[];
}

/** 발행 완료 — 대장이 네이버에 직접 발행한 뒤 URL을 기록. pending_review에서만 가능 */
export async function publishBlogJob(id: string, publishedUrl: string): Promise<BlogJob> {
  const url = publishedUrl.trim();
  if (!/^https?:\/\//.test(url)) throw new Error("발행된 글의 URL(https://…)을 입력해 주세요.");
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_jobs")
    .update({ status: "published", published_url: url, review_note: null })
    .eq("id", id)
    .eq("status", "pending_review")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("발행 대기(pending_review) 상태의 작업이 아닙니다.");
  const job = data as BlogJob;
  appendToRaw(
    "blog",
    `## 블로그 발행: ${job.draft?.title ?? job.topic}\n\n- job id: ${job.id}\n- 키워드: ${
      job.seed_keywords?.join(", ") ?? "(없음)"
    }\n- 발행 URL: ${job.published_url}`,
    job.draft?.title ?? job.topic,
  ).catch((e) => console.error("[append-to-raw] 블로그 발행 기록 실패:", e));
  return job;
}

/** 반려 — 사유 필수, pending_review에서만 가능 */
export async function rejectBlogJob(id: string, note: string): Promise<BlogJob> {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("반려 사유를 입력해 주세요.");
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_jobs")
    .update({ status: "rejected", review_note: trimmed })
    .eq("id", id)
    .eq("status", "pending_review")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("발행 대기(pending_review) 상태의 작업이 아닙니다.");
  const job = data as BlogJob;
  appendToRaw(
    "blog",
    `## 블로그 반려: ${job.draft?.title ?? job.topic}\n\n- job id: ${job.id}\n- 반려 사유: ${trimmed}`,
    job.draft?.title ?? job.topic,
  ).catch((e) => console.error("[append-to-raw] 블로그 반려 기록 실패:", e));
  return job;
}

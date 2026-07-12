import { requireAgentSupabase } from "@/lib/agent-db";
import { KAKAO_BLOG_APPROVAL_STATUSES } from "@/lib/content-status";

export type BlogPostStatus = "draft" | "pending_approval" | "published" | "rejected";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  meta_description: string | null;
  keywords: string[];
  status: BlogPostStatus;
  agent_source: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  view_count: number;
};

const BLOG_COLUMNS =
  "id, slug, title, content, excerpt, meta_description, keywords, status, agent_source, reject_reason, created_at, updated_at, published_at, view_count";

/** 한글/영문 제목을 URL slug로 변환 (한글은 그대로 유지, 공백→하이픈) */
export function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `post-${Date.now()}`;
}

/** slug 중복 시 -2, -3 ... 접미사 부여 */
export async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const supabase = requireAgentSupabase();
  let slug = baseSlug;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export async function listPublishedBlogPosts(limit = 50): Promise<BlogPost[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(BLOG_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BlogPost[];
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(BLOG_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  return (data as BlogPost | null) ?? null;
}

export async function listAllBlogPosts(limit = 50): Promise<BlogPost[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_posts")
    .select(BLOG_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as BlogPost[];
}

/**
 * 관리 화면(contents.dkansim.com) 목록용 — "최근 N개"만 가져오면 승인대기 항목이 오래돼
 * 그 안에 안 들어가는 경우 배지 카운트(getPendingApprovalCounts)와 실제 목록이 어긋난다
 * (2026-07-12 실사례: 승인대기 3건 배지가 떴는데 목록엔 하나도 안 보임). 승인대기 상태는
 * 개수 제한 없이 전부 포함하고, 나머지는 최근 것부터 채운다.
 */
export async function listBlogPostsForOverview(recentLimit = 10): Promise<BlogPost[]> {
  const supabase = requireAgentSupabase();
  const [pendingRes, recentRes] = await Promise.all([
    supabase
      .from("blog_posts")
      .select(BLOG_COLUMNS)
      .in("status", KAKAO_BLOG_APPROVAL_STATUSES)
      .order("created_at", { ascending: false }),
    supabase
      .from("blog_posts")
      .select(BLOG_COLUMNS)
      .not("status", "in", `(${KAKAO_BLOG_APPROVAL_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(recentLimit),
  ]);
  if (pendingRes.error) throw pendingRes.error;
  if (recentRes.error) throw recentRes.error;
  return [...((pendingRes.data ?? []) as BlogPost[]), ...((recentRes.data ?? []) as BlogPost[])];
}

export type CreateBlogPostInput = {
  title: string;
  content: string;
  excerpt?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  agentSource?: string | null;
  status?: BlogPostStatus;
};

export async function createBlogPost(input: CreateBlogPostInput): Promise<BlogPost> {
  const supabase = requireAgentSupabase();
  const slug = await ensureUniqueSlug(slugify(input.title));
  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      slug,
      title: input.title,
      content: input.content,
      excerpt: input.excerpt ?? null,
      meta_description: input.metaDescription ?? null,
      keywords: input.keywords ?? [],
      agent_source: input.agentSource ?? null,
      status: input.status ?? "pending_approval",
    })
    .select(BLOG_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error("블로그 글 생성 실패");
  return data as BlogPost;
}

export async function approveBlogPost(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("blog_posts")
    .update({ status: "published", published_at: new Date().toISOString(), reject_reason: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function rejectBlogPost(id: string, reason: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("blog_posts")
    .update({ status: "rejected", reject_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBlogPost(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw error;
}

export async function countBlogPostsByStatus(status: BlogPostStatus): Promise<number> {
  const supabase = requireAgentSupabase();
  const { count, error } = await supabase
    .from("blog_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  if (error) throw error;
  return count ?? 0;
}

/** 발행된 글의 조회수를 1 증가시킨다. 통계 목적이므로 실패해도 호출부 렌더링을 막지 않는다. */
export async function incrementBlogPostViewCount(slug: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.rpc("increment_blog_view", { p_slug: slug });
  if (error) throw error;
}

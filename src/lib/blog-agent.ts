import { requireAgentSupabase } from "@/lib/agent-db";
import { slugify, ensureUniqueSlug } from "@/lib/blog-store";

// 네이버 블로그는 공식 포스팅 API를 제공하지 않으므로
// 프로젝트 내부 블로그(blog_posts 테이블 → dkansim.com/blog)에 직접 발행한다.
// NAVER_CLIENT_ID/SECRET은 트렌드·검색 분석 전용.

export type BlogPublishInput = {
  title: string;
  content: string;
  tags?: string[];
  category?: string;
  excerpt?: string;
  metaDescription?: string;
  scheduledAt?: string;
};

/** 내부 블로그에 포스트를 즉시(또는 예약) 발행하고 생성된 id를 반환 */
export async function publishPost(input: BlogPublishInput): Promise<string> {
  const supabase = requireAgentSupabase();
  const slug = await ensureUniqueSlug(slugify(input.title));
  const publishedAt = input.scheduledAt
    ? new Date(input.scheduledAt).toISOString()
    : new Date().toISOString();

  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      slug,
      title: input.title,
      content: input.content,
      excerpt: input.excerpt ?? input.content.slice(0, 200),
      meta_description: input.metaDescription ?? input.content.slice(0, 160),
      keywords: input.tags ?? [],
      status: "published",
      agent_source: "blog-agent",
      published_at: publishedAt,
    })
    .select("id")
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

export type PostStats = {
  postId: string;
  slug: string;
  title: string;
  viewCount: number;
  publishedAt: string | null;
};

/** 발행된 포스트의 조회수 통계 조회 */
export async function getPostStats(postId: string): Promise<PostStats> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, view_count, published_at")
    .eq("id", postId)
    .single();
  if (error) throw error;
  const row = data as { id: string; slug: string; title: string; view_count: number; published_at: string | null };
  return {
    postId: row.id,
    slug: row.slug,
    title: row.title,
    viewCount: row.view_count ?? 0,
    publishedAt: row.published_at,
  };
}

export type BlogUpdateInput = {
  title?: string;
  content?: string;
  tags?: string[];
  excerpt?: string;
  metaDescription?: string;
  status?: string;
};

/** 발행된 포스트 수정 */
export async function updatePost(postId: string, data: BlogUpdateInput): Promise<void> {
  const supabase = requireAgentSupabase();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.title !== undefined) update.title = data.title;
  if (data.content !== undefined) update.content = data.content;
  if (data.tags !== undefined) update.keywords = data.tags;
  if (data.excerpt !== undefined) update.excerpt = data.excerpt;
  if (data.metaDescription !== undefined) update.meta_description = data.metaDescription;
  if (data.status !== undefined) update.status = data.status;
  const { error } = await supabase.from("blog_posts").update(update).eq("id", postId);
  if (error) throw error;
}

/** 포스트 소프트 삭제 (draft로 복귀) */
export async function deletePost(postId: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("blog_posts")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (error) throw error;
}

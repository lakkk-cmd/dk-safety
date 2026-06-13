import { requireAgentSupabase } from "@/lib/agent-db";

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
};

const BLOG_COLUMNS =
  "id, slug, title, content, excerpt, meta_description, keywords, status, agent_source, reject_reason, created_at, updated_at, published_at";

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

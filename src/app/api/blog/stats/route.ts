import { NextResponse } from "next/server";
import { getPostStats } from "@/lib/blog-agent";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

function checkReadAuth(request: Request): boolean {
  const secret = (process.env.AGENT_READ_SECRET?.trim() || process.env.AGENT_WRITE_SECRET?.trim()) ?? "";
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!checkReadAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");

  try {
    if (postId) {
      const stats = await getPostStats(postId);
      return NextResponse.json({ ...stats, comments: 0, likes: 0 });
    }

    // 전체 블로그 통계
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("blog_posts")
      .select("view_count")
      .eq("status", "published");
    if (error) throw error;
    const posts = (data ?? []) as Array<{ view_count: number }>;
    return NextResponse.json({
      views: posts.reduce((sum, p) => sum + (p.view_count ?? 0), 0),
      comments: 0,
      likes: 0,
      subscriberCount: 0,
      publishedCount: posts.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "통계 조회 실패" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { listAllBlogPosts } from "@/lib/blog-store";
import { getPendingApprovalCounts } from "@/lib/content-pipeline";
import { isKakaoConnected, KAKAO_OAUTH_ENABLED } from "@/lib/kakao-oauth";
import { getRecentTrendKeywords } from "@/lib/naver-pipeline";
import { isYoutubeConnected, YOUTUBE_OAUTH_ENABLED } from "@/lib/youtube-upload";

const CONTENT_MEMORY_KEY = "content_pipeline_log";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const supabase = requireAgentSupabase();

    const [youtubeRes, kakaoRes, blogPosts, pending, trendKeywords, youtubeConnected, kakaoConnected, memoryRes] = await Promise.all([
      supabase
        .from("content_youtube_queue")
        .select(
          "id, title, competitor_notes, script, thumbnail_concept, status, youtube_video_id, scenes, video_asset_url, reject_reason, created_at, updated_at, approved_at",
        )
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("content_kakao_queue")
        .select("id, title, content, status, reject_reason, created_at, updated_at, published_at")
        .order("created_at", { ascending: false })
        .limit(10),
      listAllBlogPosts(10),
      getPendingApprovalCounts(),
      getRecentTrendKeywords(10),
      isYoutubeConnected(),
      isKakaoConnected(),
      supabase.from("agent_memory").select("content").eq("key", CONTENT_MEMORY_KEY).maybeSingle(),
    ]);

    const error = [youtubeRes.error, kakaoRes.error].map((e) => e?.message).find(Boolean) ?? null;
    if (error) {
      return NextResponse.json({ message: error }, { status: 500 });
    }

    return NextResponse.json({
      youtubeQueue: youtubeRes.data ?? [],
      kakaoQueue: kakaoRes.data ?? [],
      blogPosts,
      pending,
      trendKeywords,
      youtubeConnected,
      youtubeOAuthEnabled: YOUTUBE_OAUTH_ENABLED,
      kakaoConnected,
      kakaoOAuthEnabled: KAKAO_OAUTH_ENABLED,
      memoryLog: String(memoryRes.data?.content ?? ""),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

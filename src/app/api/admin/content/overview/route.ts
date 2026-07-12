import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { listBlogPostsForOverview } from "@/lib/blog-store";
import { getPendingApprovalCounts } from "@/lib/content-pipeline";
import { KAKAO_BLOG_APPROVAL_STATUSES, YOUTUBE_APPROVAL_STATUSES } from "@/lib/content-status";
import { isKakaoConnected, KAKAO_OAUTH_ENABLED } from "@/lib/kakao-oauth";
import { getRecentTrendKeywords } from "@/lib/naver-pipeline";
import { isYoutubeConnected, YOUTUBE_OAUTH_ENABLED } from "@/lib/youtube-upload";

const CONTENT_MEMORY_KEY = "content_pipeline_log";
const PERFORMANCE_MEMORY_KEY = "content_performance_lessons";

const YOUTUBE_COLUMNS =
  "id, title, competitor_notes, script, thumbnail_concept, status, youtube_video_id, scenes, conti_summary, video_asset_url, reject_reason, created_at, updated_at, approved_at, view_count, like_count, comment_count, stats_updated_at";
const KAKAO_COLUMNS = "id, title, content, status, reject_reason, created_at, updated_at, published_at";

/**
 * "최근 N개"만 가져오면 승인대기 항목이 오래돼 그 안에 안 들어가는 경우 배지 카운트
 * (getPendingApprovalCounts)와 실제 목록이 어긋난다(2026-07-12 실사례: 승인대기 3건
 * 배지가 떴는데 목록엔 하나도 안 보임). 승인대기 상태는 개수 제한 없이 전부, 나머지는
 * 최근 것부터 채운다.
 */
async function listQueueForOverview(table: "content_youtube_queue" | "content_kakao_queue", columns: string, approvalStatuses: string[], recentLimit = 10) {
  const supabase = requireAgentSupabase();
  const [pendingRes, recentRes] = await Promise.all([
    supabase.from(table).select(columns).in("status", approvalStatuses).order("created_at", { ascending: false }),
    supabase
      .from(table)
      .select(columns)
      .not("status", "in", `(${approvalStatuses.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(recentLimit),
  ]);
  if (pendingRes.error) throw pendingRes.error;
  if (recentRes.error) throw recentRes.error;
  return [...(pendingRes.data ?? []), ...(recentRes.data ?? [])];
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const supabase = requireAgentSupabase();

    const [youtubeQueue, kakaoQueue, blogPosts, pending, trendKeywords, youtubeConnected, kakaoConnected, memoryRes, performanceRes] = await Promise.all([
      listQueueForOverview("content_youtube_queue", YOUTUBE_COLUMNS, YOUTUBE_APPROVAL_STATUSES),
      listQueueForOverview("content_kakao_queue", KAKAO_COLUMNS, KAKAO_BLOG_APPROVAL_STATUSES),
      listBlogPostsForOverview(10),
      getPendingApprovalCounts(),
      getRecentTrendKeywords(10),
      isYoutubeConnected(),
      isKakaoConnected(),
      supabase.from("agent_memory").select("content").eq("key", CONTENT_MEMORY_KEY).maybeSingle(),
      supabase.from("agent_memory").select("content").eq("key", PERFORMANCE_MEMORY_KEY).maybeSingle(),
    ]);

    return NextResponse.json({
      youtubeQueue,
      kakaoQueue,
      blogPosts,
      pending,
      trendKeywords,
      youtubeConnected,
      youtubeOAuthEnabled: YOUTUBE_OAUTH_ENABLED,
      kakaoConnected,
      kakaoOAuthEnabled: KAKAO_OAUTH_ENABLED,
      memoryLog: String(memoryRes.data?.content ?? ""),
      performanceLessons: String(performanceRes.data?.content ?? ""),
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

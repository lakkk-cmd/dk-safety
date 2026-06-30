import { NextResponse } from "next/server";
import { getAnalytics } from "@/lib/youtube-agent";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { logAgentEvent } from "@/lib/pipeline-logs";

function checkReadAuth(request: Request): boolean {
  const secret =
    process.env.AGENT_READ_SECRET?.trim() || process.env.AGENT_WRITE_SECRET?.trim() || "";
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

async function fetchChannelAnalytics(
  from: string,
  to: string,
): Promise<Record<string, unknown> | null> {
  const accessToken = process.env.YOUTUBE_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: from,
    endDate: to,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,subscribersGained",
    dimensions: "day",
    sort: "day",
  });
  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

export async function GET(request: Request) {
  if (!checkReadAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const now = new Date();
  const from =
    searchParams.get("from") ??
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = searchParams.get("to") ?? now.toISOString().slice(0, 10);

  try {
    if (videoId) {
      const analytics = await getAnalytics(videoId);
      if (isAgentSupabaseReady()) {
        const supabase = requireAgentSupabase();
        await supabase
          .from("content_youtube_queue")
          .update({
            view_count: analytics.viewCount ?? 0,
            like_count: analytics.likeCount ?? 0,
            comment_count: analytics.commentCount ?? 0,
            stats_updated_at: new Date().toISOString(),
          })
          .eq("youtube_video_id", videoId);
      }
      await logAgentEvent("info", "youtube-analytics", `영상 통계 조회: ${videoId}`);
      return NextResponse.json({ type: "video", ...analytics });
    }

    const channelData = await fetchChannelAnalytics(from, to);
    if (!channelData) {
      if (!isAgentSupabaseReady()) {
        return NextResponse.json(
          { error: "Supabase 또는 YouTube Analytics API가 설정되지 않았습니다." },
          { status: 503 },
        );
      }
      const supabase = requireAgentSupabase();
      const { data } = await supabase
        .from("content_youtube_queue")
        .select("view_count, like_count, comment_count")
        .eq("status", "uploaded")
        .not("view_count", "is", null);
      const rows = (data ?? []) as Array<{
        view_count: number;
        like_count: number;
        comment_count: number;
      }>;
      return NextResponse.json({
        type: "channel_db_aggregate",
        from,
        to,
        totalViews: rows.reduce((s, r) => s + (r.view_count ?? 0), 0),
        totalLikes: rows.reduce((s, r) => s + (r.like_count ?? 0), 0),
        totalComments: rows.reduce((s, r) => s + (r.comment_count ?? 0), 0),
        videoCount: rows.length,
      });
    }

    await logAgentEvent("info", "youtube-analytics", `채널 통계 조회: ${from}~${to}`);
    return NextResponse.json({ type: "channel", from, to, ...channelData });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "통계 조회 실패" },
      { status: 500 },
    );
  }
}

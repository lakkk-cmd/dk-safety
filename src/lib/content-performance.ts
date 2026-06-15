import { getCurrentWeekStatus } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { analyzeContentPerformance, type ContentPerformanceAnalysis } from "@/lib/content-agents";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";
import { getYoutubeAccessToken, isYoutubeConnected } from "@/lib/youtube-upload";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const PERFORMANCE_MEMORY_KEY = "content_performance_lessons";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export type PerformanceSnapshotItem = {
  kind: "youtube" | "blog";
  id: string;
  title: string;
  url: string;
  ageDays: number;
  viewCount: number;
  likeCount?: number;
  commentCount?: number;
};

export type PerformanceSnapshot = {
  youtube: PerformanceSnapshotItem[];
  blog: PerformanceSnapshotItem[];
};

/** 소유 채널의 유튜브 영상 통계(조회수/좋아요/댓글) 조회. private 영상도 OAuth로 조회 가능 */
export async function fetchYoutubeVideoStats(
  videoIds: string[],
): Promise<Map<string, { viewCount: number; likeCount: number; commentCount: number }>> {
  const result = new Map<string, { viewCount: number; likeCount: number; commentCount: number }>();
  if (videoIds.length === 0) return result;

  const accessToken = await getYoutubeAccessToken();
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", videoIds.join(","));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`유튜브 통계 조회 실패: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    items?: { id?: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
  };
  for (const item of json.items ?? []) {
    if (!item.id) continue;
    result.set(item.id, {
      viewCount: Number(item.statistics?.viewCount ?? 0),
      likeCount: Number(item.statistics?.likeCount ?? 0),
      commentCount: Number(item.statistics?.commentCount ?? 0),
    });
  }
  return result;
}

/** 업로드된 유튜브 영상 + 발행된 블로그 글의 성과 스냅샷 수집 (유튜브는 연동되어 있으면 통계 갱신) */
export async function collectPerformanceSnapshot(): Promise<PerformanceSnapshot> {
  const supabase = requireAgentSupabase();

  const { data: youtubeRows, error: ytError } = await supabase
    .from("content_youtube_queue")
    .select("id, title, youtube_video_id, approved_at, view_count, like_count, comment_count")
    .eq("status", "uploaded")
    .not("youtube_video_id", "is", null);
  if (ytError) throw ytError;

  const rows = youtubeRows ?? [];

  if (rows.length > 0 && (await isYoutubeConnected())) {
    try {
      const videoIds = rows.map((row) => row.youtube_video_id as string);
      const stats = await fetchYoutubeVideoStats(videoIds);
      for (const row of rows) {
        const stat = stats.get(row.youtube_video_id as string);
        if (!stat) continue;
        await supabase
          .from("content_youtube_queue")
          .update({
            view_count: stat.viewCount,
            like_count: stat.likeCount,
            comment_count: stat.commentCount,
            stats_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        row.view_count = stat.viewCount;
        row.like_count = stat.likeCount;
        row.comment_count = stat.commentCount;
      }
    } catch (err) {
      await logAgentEvent("warn", "content-performance-review", `유튜브 통계 조회 실패: ${errMessage(err)}`);
    }
  } else if (rows.length > 0) {
    await logAgentEvent("warn", "content-performance-review", "유튜브 미연동 — 기존 통계값 사용");
  }

  const youtube: PerformanceSnapshotItem[] = rows.map((row) => ({
    kind: "youtube",
    id: row.id,
    title: row.title,
    url: `https://www.youtube.com/watch?v=${row.youtube_video_id}`,
    ageDays: daysSince(row.approved_at),
    viewCount: row.view_count ?? 0,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
  }));

  const { data: blogRows, error: blogError } = await supabase
    .from("blog_posts")
    .select("id, slug, title, view_count, published_at")
    .eq("status", "published");
  if (blogError) throw blogError;

  const blog: PerformanceSnapshotItem[] = (blogRows ?? []).map((row) => ({
    kind: "blog",
    id: row.id,
    title: row.title,
    url: `/blog/${row.slug}`,
    ageDays: daysSince(row.published_at),
    viewCount: row.view_count ?? 0,
  }));

  return { youtube, blog };
}

export async function loadPerformanceLessons(): Promise<string> {
  const supabase = requireAgentSupabase();
  const { data } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("key", PERFORMANCE_MEMORY_KEY)
    .maybeSingle();
  return String(data?.content ?? "");
}

export async function savePerformanceLessons(content: string): Promise<void> {
  const supabase = requireAgentSupabase();
  await supabase
    .from("agent_memory")
    .upsert({ key: PERFORMANCE_MEMORY_KEY, content, updated_at: new Date().toISOString() });
}

function formatLessons(analysis: ContentPerformanceAnalysis): string {
  return [
    analysis.summary,
    analysis.insights.length ? `[인사이트]\n${analysis.insights.map((s) => `- ${s}`).join("\n")}` : "",
    analysis.recommendations.length
      ? `[추천사항]\n${analysis.recommendations.map((s) => `- ${s}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type ContentPerformanceReviewResult = {
  snapshot: PerformanceSnapshot;
  analysis: ContentPerformanceAnalysis;
};

/** 일요일 07:00 KST: 성과 수집 → Claude 분석 → 학습 내역 저장 (월요일 콘텐츠 기획에서 사용) */
export async function runContentPerformanceReview(): Promise<ContentPerformanceReviewResult> {
  const runId = await startPipelineRun("content-performance-review");
  try {
    const weekStatus = getCurrentWeekStatus();
    const snapshot = await collectPerformanceSnapshot();
    const priorLessons = await loadPerformanceLessons();
    const analysis = await analyzeContentPerformance(snapshot, priorLessons, weekStatus);

    await savePerformanceLessons(formatLessons(analysis));

    await logAgentEvent("info", "content-performance-review", "콘텐츠 성과 리뷰 완료", {
      youtubeCount: snapshot.youtube.length,
      blogCount: snapshot.blog.length,
      summary: analysis.summary,
    });
    await finishPipelineRun(runId, "success", { summary: analysis.summary });

    return { snapshot, analysis };
  } catch (err) {
    await logAgentEvent("error", "content-performance-review", `콘텐츠 성과 리뷰 실패: ${errMessage(err)}`);
    await finishPipelineRun(runId, "failed", { error: errMessage(err) });
    throw err;
  }
}

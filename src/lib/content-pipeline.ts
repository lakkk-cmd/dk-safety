import { getCurrentWeekStatus, type WeekStatus } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { loadPendingFeedback } from "@/lib/agent-memory";
import {
  countBlogPostsByStatus,
  createBlogPost,
} from "@/lib/blog-store";
import {
  draftBlogPost,
  draftKakaoPost,
  draftYoutubeScript,
  planContentWeek,
  summarizeContentPerformance,
  type ContentPlanResult,
} from "@/lib/content-agents";
import { KAKAO_MEMO_ENABLED, publishKakaoPost, sendContentApprovalNotification } from "@/lib/kakao-publish";
import { NAVER_ENABLED, collectNaverTrends, getRecentTrendKeywords } from "@/lib/naver-pipeline";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";
import { uploadYoutubeVideo } from "@/lib/youtube-upload";

const CONTENT_MEMORY_KEY = "content_pipeline_log";

async function loadContentMemory(): Promise<string> {
  const supabase = requireAgentSupabase();
  const { data } = await supabase
    .from("agent_memory")
    .select("content")
    .eq("key", CONTENT_MEMORY_KEY)
    .maybeSingle();
  return String(data?.content ?? "");
}

async function appendContentMemory(line: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const prev = await loadContentMemory();
  const next = [prev, line].filter(Boolean).join("\n").split("\n").slice(-30).join("\n");
  await supabase
    .from("agent_memory")
    .upsert({ key: CONTENT_MEMORY_KEY, content: next, updated_at: new Date().toISOString() });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── 월요일 09:00: 주간 콘텐츠 기획 ──────────────────────────────────────────────

export type ContentPlanRunResult = {
  plan: ContentPlanResult;
  trendCollected: number;
};

export async function runContentPlanning(): Promise<ContentPlanRunResult> {
  const runId = await startPipelineRun("content-plan");
  try {
    const weekStatus = getCurrentWeekStatus();
    let trendCollected = 0;

    if (NAVER_ENABLED) {
      try {
        const result = await collectNaverTrends();
        trendCollected = result.collected;
        await logAgentEvent("info", "content-plan", `네이버 트렌드 수집 완료: ${result.collected}건`, {
          errors: result.errors,
        });
      } catch (err) {
        await logAgentEvent("warn", "content-plan", `네이버 트렌드 수집 실패: ${errMessage(err)}`);
      }
    }

    const trendKeywords = await getRecentTrendKeywords();
    const memory = await loadContentMemory();
    const pendingFeedback = await loadPendingFeedback();
    const feedbackText = pendingFeedback.map((f) => f.content).join("\n---\n");

    const plan = await planContentWeek(memory, feedbackText, trendKeywords, weekStatus);

    const supabase = requireAgentSupabase();

    await supabase.from("content_youtube_queue").insert({
      title: plan.youtube.title,
      competitor_notes: plan.youtube.brief,
      status: "planning",
    });

    await supabase.from("content_kakao_queue").insert({
      title: plan.kakao.title,
      content: plan.kakao.brief,
      status: "planning",
    });

    for (const item of plan.blog) {
      await createBlogPost({
        title: item.title,
        content: item.brief,
        keywords: item.keywords ?? [],
        agentSource: "블로그 에디터 펜",
        status: "draft",
      });
    }

    await appendContentMemory(
      `[${weekStatus.message}] CMO: ${plan.cmoDirection} | CSO: ${plan.csoInsight} | CLO: ${plan.cloNotes} | 요약: ${plan.summary}`,
    );

    await logAgentEvent("info", "content-plan", "주간 콘텐츠 기획 완료", { summary: plan.summary });
    await finishPipelineRun(runId, "success", { summary: plan.summary, trendCollected });

    return { plan, trendCollected };
  } catch (err) {
    await logAgentEvent("error", "content-plan", `주간 콘텐츠 기획 실패: ${errMessage(err)}`);
    await finishPipelineRun(runId, "failed", { error: errMessage(err) });
    throw err;
  }
}

// ─── 화요일 09:00: 콘텐츠 초안 생성 ──────────────────────────────────────────────

export type ContentDraftRunResult = {
  youtubeUpdated: boolean;
  kakaoUpdated: boolean;
  blogUpdated: number;
};

export async function runContentDrafting(): Promise<ContentDraftRunResult> {
  const runId = await startPipelineRun("content-draft");
  try {
    const weekStatus = getCurrentWeekStatus();
    const supabase = requireAgentSupabase();
    let youtubeUpdated = false;
    let kakaoUpdated = false;
    let blogUpdated = 0;

    const { data: ytRow } = await supabase
      .from("content_youtube_queue")
      .select("id, title, competitor_notes")
      .eq("status", "planning")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ytRow) {
      const draft = await draftYoutubeScript(ytRow.title, ytRow.competitor_notes ?? "", weekStatus);
      await supabase
        .from("content_youtube_queue")
        .update({
          script: draft.script,
          thumbnail_concept: draft.thumbnailConcept,
          status: "pending_approval",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ytRow.id);
      youtubeUpdated = true;
    }

    const { data: kkRow } = await supabase
      .from("content_kakao_queue")
      .select("id, title, content")
      .eq("status", "planning")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (kkRow) {
      const draft = await draftKakaoPost(kkRow.title, kkRow.content ?? "", weekStatus);
      await supabase
        .from("content_kakao_queue")
        .update({ content: draft, status: "pending_approval", updated_at: new Date().toISOString() })
        .eq("id", kkRow.id);
      kakaoUpdated = true;
    }

    const { data: blogRows } = await supabase
      .from("blog_posts")
      .select("id, title, content, keywords")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(2);

    for (const row of blogRows ?? []) {
      const draft = await draftBlogPost(row.title, row.content ?? "", row.keywords ?? [], weekStatus);
      await supabase
        .from("blog_posts")
        .update({
          content: draft.content,
          excerpt: draft.excerpt,
          meta_description: draft.metaDescription,
          status: "pending_approval",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      blogUpdated += 1;
    }

    await logAgentEvent("info", "content-draft", "콘텐츠 초안 생성 완료", {
      youtubeUpdated,
      kakaoUpdated,
      blogUpdated,
    });
    await finishPipelineRun(runId, "success", { youtubeUpdated, kakaoUpdated, blogUpdated });

    return { youtubeUpdated, kakaoUpdated, blogUpdated };
  } catch (err) {
    await logAgentEvent("error", "content-draft", `콘텐츠 초안 생성 실패: ${errMessage(err)}`);
    await finishPipelineRun(runId, "failed", { error: errMessage(err) });
    throw err;
  }
}

// ─── 수요일 08:00: 승인 대기 알림 ────────────────────────────────────────────────

export type ContentApprovalNotifyResult = {
  pending: { youtube: number; kakao: number; blog: number };
  notified: boolean;
};

export async function runContentApprovalNotify(): Promise<ContentApprovalNotifyResult> {
  const runId = await startPipelineRun("content-approval-notify");
  try {
    const pending = await getPendingApprovalCounts();
    const total = pending.youtube + pending.kakao + pending.blog;

    let notified = false;
    if (total > 0 && KAKAO_MEMO_ENABLED) {
      const summary = `유튜브 ${pending.youtube}건, 카카오 ${pending.kakao}건, 블로그 ${pending.blog}건 — contents.dkansim.com에서 승인해주세요.`;
      try {
        await sendContentApprovalNotification(summary);
        notified = true;
      } catch (err) {
        await logAgentEvent("warn", "content-approval-notify", `카카오 알림 전송 실패: ${errMessage(err)}`);
      }
    }

    await logAgentEvent("info", "content-approval-notify", "승인 대기 알림 처리 완료", { pending, notified });
    await finishPipelineRun(runId, "success", { pending, notified });

    return { pending, notified };
  } catch (err) {
    await logAgentEvent("error", "content-approval-notify", `승인 알림 실패: ${errMessage(err)}`);
    await finishPipelineRun(runId, "failed", { error: errMessage(err) });
    throw err;
  }
}

// ─── 승인 대기 집계 / 성과 요약 (대시보드·주간 보고 공통) ──────────────────────────

export async function getPendingApprovalCounts(): Promise<{ youtube: number; kakao: number; blog: number }> {
  const supabase = requireAgentSupabase();
  const [ytRes, kkRes, blogPending] = await Promise.all([
    supabase.from("content_youtube_queue").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    supabase.from("content_kakao_queue").select("id", { count: "exact", head: true }).eq("status", "pending_approval"),
    countBlogPostsByStatus("pending_approval"),
  ]);
  return { youtube: ytRes.count ?? 0, kakao: kkRes.count ?? 0, blog: blogPending };
}

export async function getContentWeeklyStats(): Promise<{
  youtubePending: number;
  kakaoPending: number;
  blogPending: number;
  blogPublished: number;
}> {
  const pending = await getPendingApprovalCounts();
  const blogPublished = await countBlogPostsByStatus("published");
  return {
    youtubePending: pending.youtube,
    kakaoPending: pending.kakao,
    blogPending: pending.blog,
    blogPublished,
  };
}

export async function getContentPerformanceSummary(weekStatus?: WeekStatus): Promise<string> {
  const stats = await getContentWeeklyStats();
  return summarizeContentPerformance(stats, weekStatus);
}

// ─── 승인/반려 처리 (실제 발행·업로드 연동) ─────────────────────────────────────

export async function approveKakaoQueueItem(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("content_kakao_queue")
    .select("id, title, content")
    .eq("id", id)
    .single();
  if (error || !data) throw error ?? new Error("카카오 큐 항목을 찾을 수 없습니다.");

  await publishKakaoPost(data.title, data.content ?? "");

  await supabase
    .from("content_kakao_queue")
    .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function rejectKakaoQueueItem(id: string, reason: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("content_kakao_queue")
    .update({ status: "rejected", reject_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type ApproveYoutubeResult = { status: "approved" | "uploaded"; videoId?: string };

export async function approveYoutubeQueueItem(
  id: string,
  video?: { buffer: Buffer; mimeType: string },
): Promise<ApproveYoutubeResult> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("content_youtube_queue")
    .select("id, title, script")
    .eq("id", id)
    .single();
  if (error || !data) throw error ?? new Error("유튜브 큐 항목을 찾을 수 없습니다.");

  if (video) {
    const videoId = await uploadYoutubeVideo({
      title: data.title,
      description: data.script ?? "",
      videoBuffer: video.buffer,
      mimeType: video.mimeType,
    });
    await supabase
      .from("content_youtube_queue")
      .update({
        status: "uploaded",
        youtube_video_id: videoId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return { status: "uploaded", videoId };
  }

  await supabase
    .from("content_youtube_queue")
    .update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  return { status: "approved" };
}

export async function rejectYoutubeQueueItem(id: string, reason: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("content_youtube_queue")
    .update({ status: "rejected", reject_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

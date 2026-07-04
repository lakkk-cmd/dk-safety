import { getCurrentWeekStatus, type WeekStatus } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { loadPendingFeedback } from "@/lib/agent-memory";
import {
  approveBlogPost,
  countBlogPostsByStatus,
  createBlogPost,
} from "@/lib/blog-store";
import { GEMINI_ENABLED, validateContent } from "@/lib/cross-validate";
import {
  CONTENT_CATEGORIES,
  draftBlogPost,
  draftKakaoPost,
  draftYoutubeScript,
  planContentWeek,
  summarizeContentPerformance,
  type ContentCategory,
  type ContentPlanResult,
} from "@/lib/content-agents";
import { loadPerformanceLessons } from "@/lib/content-performance";
import {
  broadcastKakaoFriendTalkToCustomers,
  KAKAO_MEMO_ENABLED,
  publishKakaoPost,
  sendContentApprovalNotification,
} from "@/lib/kakao-publish";
import { NAVER_ENABLED, collectNaverTrends, getRecentTrendKeywords } from "@/lib/naver-pipeline";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";
import { produceVideoAssets } from "@/lib/video-pipeline";
import { uploadYoutubeVideo } from "@/lib/youtube-upload";

const CONTENT_MEMORY_KEY = "content_pipeline_log";

/**
 * CONTENT_YOUTUBE_CATEGORIES env var (쉼표 구분) 로 매주 기획할 유튜브 카테고리 목록을 읽음.
 * 예: "전기안전,자격시험"  →  주 2개 영상 기획
 * 미설정 시 기본값: ["전기안전"]
 */
function getYoutubeCategories(): ContentCategory[] {
  const raw = process.env.CONTENT_YOUTUBE_CATEGORIES?.trim();
  if (!raw) return ["전기안전"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ContentCategory => (CONTENT_CATEGORIES as string[]).includes(s));
}

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
    const performanceLessons = await loadPerformanceLessons();
    const combinedMemory = [memory, performanceLessons.trim() ? `[성과 학습]\n${performanceLessons.trim()}` : ""]
      .filter(Boolean)
      .join("\n\n");
    const pendingFeedback = await loadPendingFeedback();
    const feedbackText = pendingFeedback.map((f) => f.content).join("\n---\n");

    const youtubeCategories = getYoutubeCategories();
    const plan = await planContentWeek(combinedMemory, feedbackText, trendKeywords, weekStatus, youtubeCategories);

    const supabase = requireAgentSupabase();

    for (const yt of plan.youtubeItems) {
      await supabase.from("content_youtube_queue").insert({
        title: yt.title,
        competitor_notes: yt.brief,
        category: yt.category,
        status: "planning",
      });
    }

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

    // 모든 planning 상태 YouTube 항목 처리 (다카테고리 지원)
    const { data: ytRows } = await supabase
      .from("content_youtube_queue")
      .select("id, title, competitor_notes, category")
      .eq("status", "planning")
      .order("created_at", { ascending: true })
      .limit(2);

    for (const ytRow of ytRows ?? []) {
      const draft = await draftYoutubeScript(
        ytRow.title,
        ytRow.competitor_notes ?? "",
        weekStatus,
        (ytRow.category as ContentCategory | null) ?? undefined,
      );
      const titleCandidatesBlock = draft.titleCandidates.length
        ? `[제목 후보]\n${draft.titleCandidates.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n`
        : "";
      // 사람 승인 대신 Gemini 자동검수 게이트 — 통과하면 즉시 approved 처리하고 영상 제작(Flux 씬
      // 생성)까지 자동 트리거한다. 최종 합성+유튜브 업로드는 별도 워크플로우(video-assembly.yml,
      // Veo 비용 이슈로 스케줄 비활성화·workflow_dispatch 전용)나 Google Flow 수동 작업이 필요하다.
      let validationPassed = false;
      if (GEMINI_ENABLED) {
        try {
          const validation = await validateContent({
            title: ytRow.title,
            content: draft.script,
            contentType: "youtube",
          });
          validationPassed = validation.passed;
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `YouTube 교차검증 실패 (건너뜀): ${errMessage(err)}`);
        }
      }
      const ytStatus = validationPassed ? "approved" : "review_required";
      await supabase
        .from("content_youtube_queue")
        .update({
          script: draft.script,
          thumbnail_concept: `${titleCandidatesBlock}${draft.thumbnailConcept}`,
          status: ytStatus,
          approved_at: validationPassed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ytRow.id);
      youtubeUpdated = true;

      if (validationPassed) {
        try {
          await produceVideoAssets(ytRow.id);
          await logAgentEvent("info", "content-draft", `유튜브 스크립트 자동승인 + 영상 제작 트리거: ${ytRow.title}`);
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `영상 자산 자동생성 실패 (건너뜀): ${errMessage(err)}`);
        }
      }
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
      // 사람 승인 대신 Gemini 자동검수 게이트 — 통과하면 사람 클릭 없이 즉시 카카오 채널로 발송한다.
      let validationPassed = false;
      if (GEMINI_ENABLED) {
        try {
          const validation = await validateContent({ title: kkRow.title, content: draft, contentType: "kakao" });
          validationPassed = validation.passed;
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `Kakao 교차검증 실패 (건너뜀): ${errMessage(err)}`);
        }
      }
      await supabase
        .from("content_kakao_queue")
        .update({
          content: draft,
          status: validationPassed ? "draft" : "review_required",
          updated_at: new Date().toISOString(),
        })
        .eq("id", kkRow.id);

      if (validationPassed) {
        try {
          await approveKakaoQueueItem(kkRow.id);
          await logAgentEvent("info", "content-draft", `카카오 포스트 자동발행: ${kkRow.title}`);
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `카카오 자동발행 실패 (수동 승인 필요): ${errMessage(err)}`);
        }

        // 최근 완료 고객에게 친구톡 자동 발송 — KAKAO_FRIENDTALK_BROADCAST_ENABLED=true일 때만 동작.
        try {
          const result = await broadcastKakaoFriendTalkToCustomers(kkRow.title, draft);
          if (!result.skipped) {
            await logAgentEvent(
              "info",
              "content-draft",
              `친구톡 발송: 성공 ${result.sent}건, 실패 ${result.failed}건`,
            );
          }
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `친구톡 발송 실패: ${errMessage(err)}`);
        }
      }
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
      // 사람 승인 대신 Gemini 자동검수 게이트 — 통과하면 사람 클릭 없이 즉시 dkansim.com/blog에 발행한다.
      let validationPassed = false;
      if (GEMINI_ENABLED) {
        try {
          const validation = await validateContent({
            title: row.title,
            content: draft.content,
            contentType: "blog",
            keywords: row.keywords as string[] | undefined,
          });
          validationPassed = validation.passed;
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `Blog 교차검증 실패 (건너뜀): ${errMessage(err)}`);
        }
      }
      await supabase
        .from("blog_posts")
        .update({
          content: draft.content,
          excerpt: draft.excerpt,
          meta_description: draft.metaDescription,
          status: validationPassed ? "published" : "review_required",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (validationPassed) {
        try {
          await approveBlogPost(row.id);
          await logAgentEvent("info", "content-draft", `블로그 자동발행: ${row.title}`);
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `블로그 자동발행 실패 (수동 승인 필요): ${errMessage(err)}`);
        }
      }
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
  const APPROVAL_STATUSES = ["draft", "pending", "pending_approval", "review_required"];
  const [ytRes, kkRes, blogRes] = await Promise.all([
    supabase.from("content_youtube_queue").select("id", { count: "exact", head: true }).in("status", APPROVAL_STATUSES),
    supabase.from("content_kakao_queue").select("id", { count: "exact", head: true }).in("status", APPROVAL_STATUSES),
    supabase.from("blog_posts").select("id", { count: "exact", head: true }).in("status", APPROVAL_STATUSES),
  ]);
  return { youtube: ytRes.count ?? 0, kakao: kkRes.count ?? 0, blog: blogRes.count ?? 0 };
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

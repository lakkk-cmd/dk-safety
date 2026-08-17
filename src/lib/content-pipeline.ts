import { getCurrentWeekStatus, type WeekStatus } from "@/lib/agents";
import { verifyContentLegalRisk } from "@/lib/advisory-gates";
import { requireAgentSupabase } from "@/lib/agent-db";
import { loadPendingFeedback } from "@/lib/agent-memory";
import {
  countBlogPostsByStatus,
  createBlogPost,
} from "@/lib/blog-store";
import { GEMINI_ENABLED, validateContent } from "@/lib/cross-validate";
import {
  CONTENT_CATEGORIES,
  draftBlogPost,
  draftKakaoPost,
  draftYoutubeScript,
  runDirectorContentIntake,
  runMarketerContentBrief,
  summarizeContentPerformance,
  type ContentCategory,
  type ContentGuideline,
  type MarketerContentGuideline,
} from "@/lib/content-agents";
import { loadPerformanceLessons } from "@/lib/content-performance";
import { KAKAO_BLOG_APPROVAL_STATUSES, YOUTUBE_APPROVAL_STATUSES } from "@/lib/content-status";
import { humanizeKoreanText } from "@/lib/humanizer";
import { broadcastKakaoFriendTalkToCustomers, publishKakaoPost } from "@/lib/kakao-publish";
import { NAVER_ENABLED, collectNaverTrends, getRecentTrendKeywords } from "@/lib/naver-pipeline";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";
import { sendAdminAlertSms } from "@/lib/solapi-agent";
import { loadRecentSharedMemory } from "@/lib/shared-memory";
import { uploadYoutubeVideo } from "@/lib/youtube-upload";

/** 워커 프롬프트에 실어 보낼 "최근 공유 기억" 텍스트 — 오해 전파 방지 게이트의 일부 */
async function loadRecentContextForWorkers(): Promise<string> {
  const entries = await loadRecentSharedMemory(8).catch(() => []);
  return entries.map((m) => `- ${m.content}`).join("\n");
}

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
  guideline: MarketerContentGuideline;
  trendCollected: number;
};

/** 마케터 산출물에서 워커에게 넘길 가이드라인 부분만 뽑아 DB 저장용 JSON 문자열로 직렬화 */
function serializeGuideline(g: Partial<ContentGuideline>): string {
  return JSON.stringify({ tone: g.tone ?? "", mustInclude: g.mustInclude ?? [], mustAvoid: g.mustAvoid ?? [] });
}

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

    // 순차 위임(디렉터 파이프라인 Phase 1): 총괄디렉터가 CSO+CLO 관점을 종합해 브리핑을
    // 만들고, CMO(마케터)가 그 브리핑을 받아 워커용 제작 가이드라인을 산출한다. 이전엔
    // 이 둘이 한 번의 호출 안에서 동시에 답하는 병렬 롤플레이였다.
    const directorBrief = await runDirectorContentIntake(combinedMemory, feedbackText, weekStatus, youtubeCategories);
    const guideline = await runMarketerContentBrief(directorBrief, trendKeywords, weekStatus);
    const directorBriefJson = JSON.stringify(directorBrief);

    const supabase = requireAgentSupabase();

    for (const yt of guideline.youtubeItems) {
      await supabase.from("content_youtube_queue").insert({
        title: yt.title,
        competitor_notes: yt.brief,
        category: yt.category,
        status: "planning",
        director_brief: directorBriefJson,
        marketer_guideline: serializeGuideline(yt),
      });
    }

    await supabase.from("content_kakao_queue").insert({
      title: guideline.kakao.title,
      content: guideline.kakao.brief,
      status: "planning",
      director_brief: directorBriefJson,
      marketer_guideline: serializeGuideline(guideline.kakao),
    });

    for (const item of guideline.blog) {
      await createBlogPost({
        title: item.title,
        content: item.brief,
        keywords: item.keywords ?? [],
        agentSource: "블로그 에디터 펜",
        status: "draft",
        directorBrief: directorBriefJson,
        marketerGuideline: serializeGuideline(item),
      });
    }

    await appendContentMemory(
      `[${weekStatus.message}] 디렉터: ${directorBrief.priorities} | CLO 제약: ${directorBrief.constraints} | CMO: ${guideline.cmoDirection} | 요약: ${guideline.summary}`,
    );

    await logAgentEvent("info", "content-plan", "주간 콘텐츠 기획 완료 (디렉터→마케터 순차 위임)", {
      summary: guideline.summary,
    });
    await finishPipelineRun(runId, "success", { summary: guideline.summary, trendCollected });

    return { guideline, trendCollected };
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

export type YoutubeDraftItemResult = { id: string; title: string; status: "pending_approval" | "review_required" };

export type YoutubeDraftRunResult = {
  processed: number;
  approved: number;
  reviewRequired: number;
  items: YoutubeDraftItemResult[];
};

/**
 * "planning" 상태 유튜브 항목 중 오래된 순으로 최대 `limit`개를 뽑아, 마케터(CMO) 가이드라인을
 * 입력으로 워커(유튜브PD)가 스크립트를 작성한다. Gemini 품질게이트는 가이드라인 준수 여부까지
 * 검증하지만, 통과해도 곧바로 영상 제작·발행을 트리거하지 않는다 — 디렉터 파이프라인 재편
 * (공개 콘텐츠 발행은 항상 사람 승인) 규칙에 따라 pending_approval로 넘겨 대표님 승인을
 * 기다린다. 승인 후 "🎬 영상 제작 시작" 버튼(/contents)에서 영상 자산 생성을 별도로 트리거한다.
 * 카카오/블로그는 건드리지 않는다 — runContentDrafting()의 화/수요일 정기 배치와 별도로,
 * 관리자가 "유튜브만 지금 N개 더" 요청할 때 재사용하기 위해 분리했다.
 */
export async function runYoutubeDrafting(limit = 2): Promise<YoutubeDraftRunResult> {
  const weekStatus = getCurrentWeekStatus();
  const supabase = requireAgentSupabase();
  const result: YoutubeDraftRunResult = { processed: 0, approved: 0, reviewRequired: 0, items: [] };
  const recentContext = await loadRecentContextForWorkers();

  const { data: ytRows } = await supabase
    .from("content_youtube_queue")
    .select("id, title, competitor_notes, category, marketer_guideline")
    .eq("status", "planning")
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const ytRow of ytRows ?? []) {
    const guideline = ytRow.marketer_guideline
      ? (JSON.parse(ytRow.marketer_guideline) as Partial<ContentGuideline>)
      : undefined;
    const draft = await draftYoutubeScript(
      ytRow.title,
      ytRow.competitor_notes ?? "",
      weekStatus,
      (ytRow.category as ContentCategory | null) ?? undefined,
      guideline,
      recentContext,
    );
    draft.script = await humanizeKoreanText(draft.script, 6000);
    const titleCandidatesBlock = draft.titleCandidates.length
      ? `[제목 후보]\n${draft.titleCandidates.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\n`
      : "";
    let validationPassed = false;
    if (GEMINI_ENABLED) {
      try {
        const validation = await validateContent({
          title: ytRow.title,
          content: draft.script,
          contentType: "youtube",
          guideline,
        });
        validationPassed = validation.passed;
      } catch (err) {
        await logAgentEvent("warn", "content-draft", `YouTube 교차검증 실패 (건너뜀): ${errMessage(err)}`);
      }
    }
    // CLO 검증 게이트 — Gemini 통과 후에만 실행(비용 절약). 법적 리스크가 있으면 통과를 뒤집는다.
    if (validationPassed) {
      const clo = await verifyContentLegalRisk(ytRow.title, draft.script, "youtube");
      if (clo.concern) {
        validationPassed = false;
        await logAgentEvent("warn", "content-draft", `CLO 법적 검토 반려: ${ytRow.title} — ${clo.concern}`);
      }
    }
    const ytStatus: "pending_approval" | "review_required" = validationPassed ? "pending_approval" : "review_required";
    await supabase
      .from("content_youtube_queue")
      .update({
        script: draft.script,
        thumbnail_concept: `${titleCandidatesBlock}${draft.thumbnailConcept}`,
        status: ytStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ytRow.id);

    result.processed += 1;
    if (validationPassed) {
      result.approved += 1;
      await logAgentEvent("info", "content-draft", `유튜브 스크립트 품질게이트 통과, 승인 대기: ${ytRow.title}`);
    } else {
      result.reviewRequired += 1;
    }
    result.items.push({ id: ytRow.id, title: ytRow.title, status: ytStatus });
  }

  return result;
}

export async function runContentDrafting(): Promise<ContentDraftRunResult> {
  const runId = await startPipelineRun("content-draft");
  try {
    const supabase = requireAgentSupabase();
    const weekStatus = getCurrentWeekStatus();
    const ytResult = await runYoutubeDrafting(2);
    const youtubeUpdated = ytResult.processed > 0;
    let kakaoUpdated = false;
    let blogUpdated = 0;
    const recentContext = await loadRecentContextForWorkers();

    const { data: kkRow } = await supabase
      .from("content_kakao_queue")
      .select("id, title, content, marketer_guideline")
      .eq("status", "planning")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (kkRow) {
      const kkGuideline = kkRow.marketer_guideline
        ? (JSON.parse(kkRow.marketer_guideline) as Partial<ContentGuideline>)
        : undefined;
      const draftRaw = await draftKakaoPost(kkRow.title, kkRow.content ?? "", weekStatus, kkGuideline, recentContext);
      const draft = await humanizeKoreanText(draftRaw, 800);
      // 품질게이트(마케터 가이드라인 대비 검증)를 통과해도 곧바로 발송하지 않는다 — 디렉터
      // 파이프라인 재편 규칙에 따라 카카오 발행은 항상 대표님 승인을 거친다(/contents에서
      // 승인 클릭 → approveKakaoQueueItem이 실제 발송을 트리거).
      let validationPassed = false;
      if (GEMINI_ENABLED) {
        try {
          const validation = await validateContent({
            title: kkRow.title,
            content: draft,
            contentType: "kakao",
            guideline: kkGuideline,
          });
          validationPassed = validation.passed;
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `Kakao 교차검증 실패 (건너뜀): ${errMessage(err)}`);
        }
      }
      if (validationPassed) {
        const clo = await verifyContentLegalRisk(kkRow.title, draft, "kakao");
        if (clo.concern) {
          validationPassed = false;
          await logAgentEvent("warn", "content-draft", `CLO 법적 검토 반려: ${kkRow.title} — ${clo.concern}`);
        }
      }
      await supabase
        .from("content_kakao_queue")
        .update({
          content: draft,
          status: validationPassed ? "pending_approval" : "review_required",
          updated_at: new Date().toISOString(),
        })
        .eq("id", kkRow.id);

      if (validationPassed) {
        await logAgentEvent("info", "content-draft", `카카오 포스트 품질게이트 통과, 승인 대기: ${kkRow.title}`);
      }
      kakaoUpdated = true;
    }

    const { data: blogRows } = await supabase
      .from("blog_posts")
      .select("id, title, content, keywords, slug, marketer_guideline")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(2);

    for (const row of blogRows ?? []) {
      const blogGuideline = row.marketer_guideline
        ? (JSON.parse(row.marketer_guideline) as Partial<ContentGuideline>)
        : undefined;
      const draft = await draftBlogPost(row.title, row.content ?? "", row.keywords ?? [], weekStatus, blogGuideline, recentContext);
      draft.content = await humanizeKoreanText(draft.content, 2500);
      // 품질게이트를 통과해도 곧바로 발행하지 않는다 — 디렉터 파이프라인 재편 규칙에 따라
      // 블로그 발행은 항상 대표님 승인을 거친다(/contents에서 승인 클릭 → approveBlogPost).
      let validationPassed = false;
      if (GEMINI_ENABLED) {
        try {
          const validation = await validateContent({
            title: row.title,
            content: draft.content,
            contentType: "blog",
            keywords: row.keywords as string[] | undefined,
            guideline: blogGuideline,
          });
          validationPassed = validation.passed;
        } catch (err) {
          await logAgentEvent("warn", "content-draft", `Blog 교차검증 실패 (건너뜀): ${errMessage(err)}`);
        }
      }
      if (validationPassed) {
        const clo = await verifyContentLegalRisk(row.title, draft.content, "blog");
        if (clo.concern) {
          validationPassed = false;
          await logAgentEvent("warn", "content-draft", `CLO 법적 검토 반려: ${row.title} — ${clo.concern}`);
        }
      }
      await supabase
        .from("blog_posts")
        .update({
          content: draft.content,
          excerpt: draft.excerpt,
          meta_description: draft.metaDescription,
          status: validationPassed ? "pending_approval" : "review_required",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (validationPassed) {
        await logAgentEvent("info", "content-draft", `블로그 초안 품질게이트 통과, 승인 대기: ${row.title}`);
      }
      blogUpdated += 1;
    }

    await logAgentEvent("info", "content-draft", "콘텐츠 초안 생성 완료", {
      youtubeUpdated,
      kakaoUpdated,
      blogUpdated,
    });
    await finishPipelineRun(runId, "success", { youtubeUpdated, kakaoUpdated, blogUpdated });

    // Gemini 자동검수를 통과 못한 항목(review_required 등)만 실제 사람 승인이 필요하다 —
    // 즉시 SMS로 알려 주간 배치(runContentApprovalNotify)까지 기다리지 않게 한다.
    try {
      const pending = await getPendingApprovalCounts();
      const total = pending.youtube + pending.kakao + pending.blog;
      if (total > 0) {
        await sendAdminAlertSms(
          `[승인대기] 유튜브 ${pending.youtube}건, 카카오 ${pending.kakao}건, 블로그 ${pending.blog}건\ncontents.dkansim.com`
        );
      }
    } catch (err) {
      await logAgentEvent("warn", "content-draft", `승인대기 SMS 알림 실패: ${errMessage(err)}`);
    }

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
    if (total > 0) {
      const summary = `[승인대기 리마인더] 유튜브 ${pending.youtube}건, 카카오 ${pending.kakao}건, 블로그 ${pending.blog}건 — contents.dkansim.com에서 승인해주세요.`;
      try {
        await sendAdminAlertSms(summary);
        notified = true;
      } catch (err) {
        await logAgentEvent("warn", "content-approval-notify", `SMS 알림 전송 실패: ${errMessage(err)}`);
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
  const [ytRes, kkRes, blogRes] = await Promise.all([
    supabase.from("content_youtube_queue").select("id", { count: "exact", head: true }).in("status", YOUTUBE_APPROVAL_STATUSES),
    supabase.from("content_kakao_queue").select("id", { count: "exact", head: true }).in("status", KAKAO_BLOG_APPROVAL_STATUSES),
    supabase.from("blog_posts").select("id", { count: "exact", head: true }).in("status", KAKAO_BLOG_APPROVAL_STATUSES),
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

  // 최근 완료 고객에게 친구톡 자동 발송 — KAKAO_FRIENDTALK_BROADCAST_ENABLED=true일 때만 동작.
  // 디렉터 파이프라인 재편 이전엔 초안 자동발행 시점에 함께 쐈으나, 발행 자체가 항상 사람
  // 승인을 거치도록 바뀌면서 실제 발행이 일어나는 이 함수로 옮겼다.
  try {
    const broadcast = await broadcastKakaoFriendTalkToCustomers(data.title, data.content ?? "");
    if (!broadcast.skipped) {
      await logAgentEvent("info", "content-approve", `친구톡 발송: 성공 ${broadcast.sent}건, 실패 ${broadcast.failed}건`);
    }
  } catch (err) {
    await logAgentEvent("warn", "content-approve", `친구톡 발송 실패: ${errMessage(err)}`);
  }
}

export async function rejectKakaoQueueItem(id: string, reason: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("content_kakao_queue")
    .update({ status: "rejected", reject_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteKakaoQueueItem(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("content_kakao_queue").delete().eq("id", id);
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

export async function deleteYoutubeQueueItem(id: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("content_youtube_queue").delete().eq("id", id);
  if (error) throw error;
}

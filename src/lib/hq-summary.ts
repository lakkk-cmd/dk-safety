import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { formatScheduleSummary, getKstDateTime, loadMeetingSchedule } from "@/lib/agent-schedule";
import { getCurrentWeekStatus, type WeekStatus } from "@/lib/agents";
import { getPendingApprovalCounts } from "@/lib/content-pipeline";
import { countUnacknowledgedImprovementRequests } from "@/lib/improvement-requests";
import { readReservations, type Reservation } from "@/lib/reservations-store";

export type HqSummary = {
  today: string;
  weekStatus: WeekStatus;
  notificationCount: number;
  reservations: {
    todayCount: number;
    today: Reservation[];
    totalCount: number;
    statusCounts: Record<"waiting_payment" | "접수" | "진행중" | "완료", number>;
    unpaidCount: number;
  };
  content: { pending: { youtube: number; kakao: number; blog: number }; pendingTotal: number };
  improvements: { unacknowledged: number };
  feedback: { pending: number };
  pipeline: { latest: { pipeline: string; status: string; started_at: string; finished_at: string | null } | null };
  report: { latest: { date_label: string; chief_summary: string | null; created_at: string; approved: boolean } | null };
  scheduleSummary: string;
  agentSupabaseReady: boolean;
};

/** HQ 대시보드/헤더 알림 뱃지가 공유하는 현황 요약. */
export async function getHqSummary(): Promise<HqSummary> {
  const kst = getKstDateTime();
  const weekStatus = getCurrentWeekStatus();

  const reservations = await readReservations();
  const todayReservations = reservations.filter((r) => r.preferredDate === kst.dateKey);
  const statusCounts: HqSummary["reservations"]["statusCounts"] = {
    waiting_payment: 0,
    접수: 0,
    진행중: 0,
    완료: 0,
  };
  let unpaidCount = 0;
  for (const r of reservations) {
    if (r.status in statusCounts) {
      statusCounts[r.status as keyof typeof statusCounts] += 1;
    }
    if (!r.isPaid) unpaidCount += 1;
  }

  const ready = isAgentSupabaseReady();
  let pendingContent = { youtube: 0, kakao: 0, blog: 0 };
  let unacknowledgedImprovements = 0;
  let pendingFeedback = 0;
  let latestPipeline: HqSummary["pipeline"]["latest"] = null;
  let latestReport: HqSummary["report"]["latest"] = null;
  let scheduleSummary = "";

  if (ready) {
    try {
      const supabase = requireAgentSupabase();
      const [pending, unacknowledged, feedbackRes, pipelineRes, reportRes, schedule] = await Promise.all([
        getPendingApprovalCounts(),
        countUnacknowledgedImprovementRequests(),
        supabase.from("boss_feedback").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("pipeline_logs")
          .select("pipeline, status, started_at, finished_at")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("agent_reports")
          .select("date_label, chief_summary, created_at, approved")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        loadMeetingSchedule(),
      ]);

      pendingContent = pending;
      unacknowledgedImprovements = unacknowledged;
      pendingFeedback = feedbackRes.count ?? 0;
      latestPipeline = pipelineRes.data ?? null;
      latestReport = reportRes.data ?? null;
      scheduleSummary = formatScheduleSummary(schedule, kst);
    } catch (error) {
      scheduleSummary = error instanceof Error ? error.message : "사령부 데이터 조회 실패";
    }
  }

  const pendingContentTotal = pendingContent.youtube + pendingContent.kakao + pendingContent.blog;
  const notificationCount = pendingContentTotal + unacknowledgedImprovements + pendingFeedback;

  return {
    today: kst.dateKey,
    weekStatus,
    notificationCount,
    reservations: {
      todayCount: todayReservations.length,
      today: todayReservations,
      totalCount: reservations.length,
      statusCounts,
      unpaidCount,
    },
    content: { pending: pendingContent, pendingTotal: pendingContentTotal },
    improvements: { unacknowledged: unacknowledgedImprovements },
    feedback: { pending: pendingFeedback },
    pipeline: { latest: latestPipeline },
    report: { latest: latestReport },
    scheduleSummary,
    agentSupabaseReady: ready,
  };
}

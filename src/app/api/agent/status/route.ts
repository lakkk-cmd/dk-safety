import { NextResponse } from "next/server";
import { getAgentSupabase, isAgentSupabaseReady } from "@/lib/agent-db";
import { getCurrentWeekStatus } from "@/lib/agents";

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

  const supabase = getAgentSupabase()!;
  const today = new Date().toISOString().slice(0, 10);
  const weekStatus = getCurrentWeekStatus();

  const [
    todayRes,
    allStatusRes,
    ytPendingRes,
    blogPendingRes,
    kakaoPendingRes,
    feedbackRes,
    pipelineRes,
  ] = await Promise.allSettled([
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00`),
    supabase.from("reservations").select("status"),
    supabase
      .from("content_youtube_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval"),
    supabase
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval"),
    supabase
      .from("content_kakao_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval"),
    supabase
      .from("boss_feedback")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false),
    supabase
      .from("pipeline_logs")
      .select("pipeline, status, finished_at")
      .order("finished_at", { ascending: false })
      .limit(5),
  ]);

  // 이번 달 매출 (Toss 미설정 시 graceful skip)
  let monthlyRevenue = { total: 0, count: 0 };
  try {
    const { getMonthlyRevenue } = await import("@/lib/toss-agent");
    const r = await getMonthlyRevenue();
    monthlyRevenue = { total: r.total, count: r.count };
  } catch {}

  // 상태별 예약 집계
  const statusCounts: Record<string, number> = {};
  if (allStatusRes.status === "fulfilled") {
    for (const r of (allStatusRes.value.data ?? []) as Array<{ status: string }>) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }
  }

  const weeklyTarget = weekStatus.weeklyTarget;
  const achievementRate =
    weeklyTarget > 0 ? Math.round((monthlyRevenue.total / weeklyTarget) * 100) : 0;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    week: weekStatus.message,
    todayReservations: todayRes.status === "fulfilled" ? (todayRes.value.count ?? 0) : 0,
    reservationsByStatus: statusCounts,
    contentPendingApproval: {
      youtube: ytPendingRes.status === "fulfilled" ? (ytPendingRes.value.count ?? 0) : 0,
      blog: blogPendingRes.status === "fulfilled" ? (blogPendingRes.value.count ?? 0) : 0,
      kakao: kakaoPendingRes.status === "fulfilled" ? (kakaoPendingRes.value.count ?? 0) : 0,
    },
    monthlyRevenue,
    weeklyTarget,
    achievementRate,
    unprocessedFeedback:
      feedbackRes.status === "fulfilled" ? (feedbackRes.value.count ?? 0) : 0,
    recentPipeline:
      pipelineRes.status === "fulfilled" ? (pipelineRes.value.data ?? []) : [],
  });
}

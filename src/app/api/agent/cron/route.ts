import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { logAgentEvent } from "@/lib/pipeline-logs";

export const maxDuration = 300;

function checkCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!checkCronAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const results: Record<string, string> = {};

  // ① 마켓 인텔리전스 수집
  try {
    const { runMarketIntelligenceCollection } = await import("@/lib/market-intelligence");
    await runMarketIntelligenceCollection();
    results.market_intelligence = "success";
    await logAgentEvent("info", "agent-cron", "마켓 인텔리전스 수집 완료");
  } catch (err) {
    results.market_intelligence = `failed: ${err instanceof Error ? err.message : String(err)}`;
    await logAgentEvent("error", "agent-cron", "마켓 인텔리전스 수집 실패", { error: results.market_intelligence });
  }

  // ② YouTube 통계 업데이트 (uploaded 상태 항목)
  if (isAgentSupabaseReady()) {
    try {
      const supabase = requireAgentSupabase();
      const { data: items } = await supabase
        .from("content_youtube_queue")
        .select("id, youtube_video_id")
        .eq("status", "uploaded")
        .not("youtube_video_id", "is", null)
        .limit(10);

      if (items && items.length > 0) {
        const { getAnalytics } = await import("@/lib/youtube-agent");
        let updated = 0;
        for (const item of items as Array<{ id: string; youtube_video_id: string }>) {
          try {
            const stats = await getAnalytics(item.youtube_video_id);
            await supabase
              .from("content_youtube_queue")
              .update({
                view_count: stats.viewCount ?? 0,
                like_count: stats.likeCount ?? 0,
                comment_count: stats.commentCount ?? 0,
                stats_updated_at: new Date().toISOString(),
              })
              .eq("id", item.id);
            updated++;
          } catch {}
        }
        results.youtube_stats = `updated: ${updated}/${items.length}`;
      } else {
        results.youtube_stats = "no items";
      }
    } catch (err) {
      results.youtube_stats = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ③ SMS 예약 리마인더 (내일 예약 고객에게 발송)
  if (isAgentSupabaseReady()) {
    try {
      const supabase = requireAgentSupabase();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const { data: reservations } = await supabase
        .from("reservations")
        .select("id, customer_name, customer_phone, preferred_date, address")
        .eq("preferred_date", tomorrowStr)
        .in("status", ["confirmed", "scheduled"]);

      if (reservations && reservations.length > 0) {
        const { sendSMS: solapiSendSMS } = await import("@/lib/solapi-agent");
        let sentCount = 0;
        for (const r of reservations as Array<{
          id: string;
          customer_name: string;
          customer_phone: string;
          preferred_date: string;
          address: string;
        }>) {
          if (!r.customer_phone) continue;
          try {
            await solapiSendSMS(
              r.customer_phone,
              `[우리집 전기주치의] ${r.customer_name}님, 내일(${r.preferred_date}) 전기안전점검 일정이 있습니다. 방문 전 연락드리겠습니다.`,
            );
            sentCount++;
          } catch {}
        }
        results.sms_reminders = `sent: ${sentCount}/${reservations.length}`;
      } else {
        results.sms_reminders = "no tomorrow reservations";
      }
    } catch (err) {
      results.sms_reminders = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ④ 주간 목표 현황 → boss_feedback 기록
  if (isAgentSupabaseReady()) {
    try {
      const { getDailyRevenue } = await import("@/lib/toss-agent");
      const { getCurrentWeekStatus } = await import("@/lib/agents");
      const supabase = requireAgentSupabase();
      const weekStatus = getCurrentWeekStatus();
      let dailyRevTotal = 0;
      try {
        const dr = await getDailyRevenue();
        dailyRevTotal = dr.total;
      } catch {}
      const summary = `자동 일일 현황 보고: ${weekStatus.message} | 오늘 매출 ${dailyRevTotal.toLocaleString()}원`;
      await supabase.from("boss_feedback").insert({
        content: summary,
        source: "agent_cron",
        is_read: false,
      });
      results.weekly_goal = "recorded";
    } catch (err) {
      results.weekly_goal = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({ success: true, tasks: results });
}

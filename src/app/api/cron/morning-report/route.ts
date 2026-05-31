import { NextResponse } from "next/server";
import { Resend } from "resend";
import { runDailyAgentPipeline } from "@/lib/agent-pipeline";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import {
  DEFAULT_MEETING_TOPICS,
  evaluateReportSchedule,
  getKstDateTime,
  loadMeetingSchedule,
  loadPendingTopics,
  markFirstReportCompleted,
} from "@/lib/agent-schedule";
import { buildEmailHTML, buildEmailText } from "@/lib/email-template";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json(
      { success: false, error: "Supabase URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정" },
      { status: 500 },
    );
  }
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.REPORT_EMAIL?.trim()) {
    return NextResponse.json(
      { success: false, error: "RESEND_API_KEY 또는 REPORT_EMAIL 미설정" },
      { status: 500 },
    );
  }

  const kst = getKstDateTime();
  const schedule = await loadMeetingSchedule();
  const gate = evaluateReportSchedule(kst, schedule);

  if (!force && !gate.run) {
    console.log(`[cron] Skipped: ${gate.reason} (KST ${kst.dateKey}, dow=${kst.dayOfWeek})`);
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: gate.reason,
      kst_date: kst.dateKey,
      schedule,
    });
  }

  const pendingTopics = await loadPendingTopics();
  const topics = pendingTopics.length > 0 ? pendingTopics : DEFAULT_MEETING_TOPICS;

  if (gate.kind === "first" && pendingTopics.length === 0 && !force) {
    return NextResponse.json(
      {
        success: false,
        error: "첫 회의 주제가 없습니다. 사령부에서 회의 주제를 저장한 뒤 다시 실행하세요.",
        first_report_date: schedule.firstReportDate,
      },
      { status: 400 },
    );
  }

  const dateStr = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const reportLabel = gate.kind === "first" ? "첫 경영진 회의" : "주간 경영진 회의";

  let pipeline;
  try {
    pipeline = await runDailyAgentPipeline(topics, dateStr, { clearTopicsAfterRun: true });
  } catch (err) {
    console.error("[cron] Pipeline failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (gate.kind === "first") {
    await markFirstReportCompleted();
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const emailSectionsFixed = pipeline.sections.map((s) => ({
    topic: s.topic,
    chiefSummary: s.chief_summary,
    responses: s.round2.map((r) => ({
      agent: { id: r.agent_id, name: r.agent_name, role: r.role },
      response: r.response,
    })),
  }));

  try {
    const { error } = await resend.emails.send({
      from: "우리집 안심전기 <report@dkansim.com>",
      to: [process.env.REPORT_EMAIL!],
      subject: `[우리집 안심전기] ${reportLabel} 보고 — ${dateStr}`,
      html: buildEmailHTML(emailSectionsFixed, dateStr, pipeline.chiefDailySummary, pipeline.feedbackApplied),
      text: buildEmailText(emailSectionsFixed, dateStr, pipeline.chiefDailySummary, pipeline.feedbackApplied),
    });
    if (error) throw error;
  } catch (err) {
    console.error("[cron] Email send failed:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    skipped: false,
    report_kind: gate.kind ?? (force ? "manual" : "weekly"),
    date: dateStr,
    topics,
    topics_source: pendingTopics.length > 0 ? "command_center" : "default",
    sent_to: process.env.REPORT_EMAIL,
    feedback_applied: Boolean(pipeline.feedbackApplied),
    feedback_count: pipeline.feedbackIds.length,
    schedule,
  });
}

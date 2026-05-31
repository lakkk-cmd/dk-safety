import { NextResponse } from "next/server";
import { Resend } from "resend";
import { runDailyAgentPipeline } from "@/lib/agent-pipeline";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { buildEmailHTML, buildEmailText } from "@/lib/email-template";

const DAILY_TOPICS = ["마케팅 전략", "앱 다음 스펙", "수익 구조 점검"];

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  const dateStr = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  let pipeline;
  try {
    pipeline = await runDailyAgentPipeline(DAILY_TOPICS, dateStr);
  } catch (err) {
    console.error("[cron] Pipeline failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const emailSections = pipeline.sections.map((s) => ({
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
      subject: `[우리집 안심전기] 주간 경영진 회의 보고 — ${dateStr}`,
      html: buildEmailHTML(emailSections, dateStr, pipeline.chiefDailySummary, pipeline.feedbackApplied),
      text: buildEmailText(emailSections, dateStr, pipeline.chiefDailySummary, pipeline.feedbackApplied),
    });
    if (error) throw error;
  } catch (err) {
    console.error("[cron] Email send failed:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    date: dateStr,
    topics: DAILY_TOPICS,
    sent_to: process.env.REPORT_EMAIL,
    feedback_applied: Boolean(pipeline.feedbackApplied),
    feedback_count: pipeline.feedbackIds.length,
  });
}

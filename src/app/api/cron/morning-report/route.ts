import { NextResponse } from "next/server";
import { Resend } from "resend";
import { runDailyAgentPipeline } from "@/lib/agent-pipeline";

async function sendKakaoMe(text: string): Promise<void> {
  const token = process.env.KAKAO_ACCESS_TOKEN?.trim();
  if (!token) return;
  try {
    const template = JSON.stringify({ object_type: "text", text, link: { web_url: "https://dkansim.com/admin", mobile_web_url: "https://dkansim.com/admin" } });
    const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ template_object: template }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[cron] Kakao me send failed:", res.status, err.slice(0, 200));
    }
  } catch (err) {
    console.error("[cron] Kakao me send error:", err);
  }
}
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { buildAdminReportMeta, SUPABASE_DOCUMENTS_BUCKET } from "@/lib/document-generator";
import { renderAdminReportPdf } from "@/lib/document-pdf";
import { uploadBinaryObject } from "@/lib/supabase-server";
import {
  DEFAULT_MEETING_TOPICS,
  evaluateReportSchedule,
  getKstDateTime,
  loadMeetingSchedule,
  loadPendingTopics,
  markFirstReportCompleted,
} from "@/lib/agent-schedule";
import { getContentPerformanceSummary, getPendingApprovalCounts } from "@/lib/content-pipeline";
import { buildEmailHTML, buildEmailText, type ContentPerformanceSummary } from "@/lib/email-template";

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
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] Pipeline failed:", err);
    await sendKakaoMe(`[파이프라인 실패] ⚠️\nmorning-report (경영진 회의)\n\n${message.slice(0, 300)}`);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  if (gate.kind === "first") {
    await markFirstReportCompleted();
  }

  let contentSummary: ContentPerformanceSummary | null = null;
  try {
    const [performanceText, pending] = await Promise.all([
      getContentPerformanceSummary(pipeline.weekStatus),
      getPendingApprovalCounts(),
    ]);
    contentSummary = { text: performanceText, pending };
  } catch (err) {
    console.error("[cron] Content performance summary failed:", err);
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

  // 행정업무운영편람 간이기안문(별지 제2호서식) 양식 PDF — 실패해도 이메일 발송 자체는 막지 않는다
  // (내부 보고 형식일 뿐, 핵심 정보는 이미 이메일 본문에 있으므로).
  let reportPdfBytes: Uint8Array | null = null;
  try {
    reportPdfBytes = await renderAdminReportPdf({
      title: `${reportLabel} 보고서`,
      meta: buildAdminReportMeta({ draftedBy: "AI 경영진 6인", summary: pipeline.weekStatus.message }),
      sections: pipeline.sections.map((s) => ({ heading: s.topic, body: s.chief_summary })),
    });
    const pdfUrl = await uploadBinaryObject({
      bucket: SUPABASE_DOCUMENTS_BUCKET,
      objectPath: `agent-reports/${pipeline.reportId}.pdf`,
      contentType: "application/pdf",
      data: reportPdfBytes,
    });
    await requireAgentSupabase().from("agent_reports").update({ pdf_url: pdfUrl }).eq("id", pipeline.reportId);
  } catch (err) {
    console.error("[cron] 업무보고서 PDF 생성/업로드 실패:", err);
  }

  try {
    const { error } = await resend.emails.send({
      from: "우리집 안심전기 <report@dkansim.com>",
      to: [process.env.REPORT_EMAIL!],
      subject: `[우리집 안심전기] ${reportLabel} 보고 — ${dateStr}`,
      html: buildEmailHTML(emailSectionsFixed, dateStr, pipeline.chiefDailySummary, pipeline.feedbackApplied, contentSummary),
      text: buildEmailText(emailSectionsFixed, dateStr, pipeline.chiefDailySummary, pipeline.feedbackApplied, contentSummary),
      attachments: reportPdfBytes
        ? [{ filename: `${reportLabel}_${dateStr.replace(/[.\s:]/g, "-")}.pdf`, content: Buffer.from(reportPdfBytes) }]
        : undefined,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[cron] Email send failed:", err);
    await sendKakaoMe(`[파이프라인 실패] ⚠️\nmorning-report (이메일 발송)\n\n${String(err).slice(0, 300)}`);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }

  const chiefOneLiner = pipeline.chiefDailySummary
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .find((l) => !l.startsWith("[")) ?? pipeline.chiefDailySummary.slice(0, 80);

  const pendingTotal = contentSummary
    ? contentSummary.pending.youtube + contentSummary.pending.kakao + contentSummary.pending.blog
    : 0;
  const pendingLine = pendingTotal > 0
    ? `\n콘텐츠 승인 대기: 유튜브 ${contentSummary!.pending.youtube} · 카카오 ${contentSummary!.pending.kakao} · 블로그 ${contentSummary!.pending.blog} → https://contents.dkansim.com`
    : "";

  await sendKakaoMe(
    `[대경이엔피] 주간 보고 도착 📊\n${dateStr} ${reportLabel} 완료\n핵심결론: ${chiefOneLiner.slice(0, 100)}${pendingLine}\n▶ 전체보고: https://dkansim.com/admin`,
  );

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

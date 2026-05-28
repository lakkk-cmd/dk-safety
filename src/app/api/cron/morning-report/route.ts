import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { runMeeting, AGENTS } from "@/lib/agents";
import { buildEmailHTML, buildEmailText } from "@/lib/email-template";

const DAILY_TOPICS = [
  "마케팅 전략",
  "앱 다음 스펙",
  "수익 구조 점검",
];

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const resend = new Resend(process.env.RESEND_API_KEY!);

  let memory = "";
  try {
    const { data } = await supabase
      .from("agent_memory")
      .select("content")
      .eq("key", "shared_memory")
      .single();
    if (data?.content) memory = data.content;
  } catch {
    console.warn("[cron] Memory load failed");
  }

  const sections: { topic: string; responses: Awaited<ReturnType<typeof runMeeting>> }[] = [];

  for (const topic of DAILY_TOPICS) {
    console.log(`[cron] Running meeting: ${topic}`);
    try {
      const responses = await runMeeting(topic, memory);
      sections.push({ topic, responses });
    } catch (err) {
      console.error(`[cron] Meeting failed for "${topic}":`, err);
      sections.push({
        topic,
        responses: AGENTS.map((agent) => ({ agent, response: "⚠️ 분석 중 오류 발생" })),
      });
    }
  }

  const dateStr = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  try {
    await supabase.from("agent_reports").insert({
      created_at: new Date().toISOString(),
      date_label: dateStr,
      sections: sections.map((s) => ({
        topic: s.topic,
        responses: s.responses.map((r) => ({
          agent_id: r.agent.id,
          agent_name: r.agent.name,
          role: r.agent.role,
          response: r.response,
        })),
      })),
    });
  } catch (err) {
    console.error("[cron] Supabase save failed:", err);
  }

  const newLines = sections.map(
    (s) => `[${dateStr}] ${s.topic}: ` +
      s.responses.slice(0, 2).map((r) => `${r.agent.name}-${r.response.slice(0, 40)}`).join(" / ")
  );
  const updatedMemory = [memory, ...newLines].join("\n").split("\n").slice(-30).join("\n");

  try {
    await supabase.from("agent_memory").upsert({ key: "shared_memory", content: updatedMemory });
  } catch (err) {
    console.error("[cron] Memory update failed:", err);
  }

  try {
    const { error } = await resend.emails.send({
      from: "우리집 안심전기 <report@dkansim.com>",
      to: [process.env.REPORT_EMAIL!],
      subject: `[우리집 안심전기] 에이전트 보고서 — ${dateStr}`,
      html: buildEmailHTML(sections, dateStr),
      text: buildEmailText(sections, dateStr),
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
  });
}
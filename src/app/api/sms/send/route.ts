import { NextResponse } from "next/server";
import { sendSMS, sendLMS, sendBulk } from "@/lib/solapi-agent";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

const MAX_BULK = 100;

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

async function logSms(type: string, count: number, status: "sent" | "failed", error?: string) {
  if (!isAgentSupabaseReady()) return;
  try {
    const supabase = requireAgentSupabase();
    await supabase.from("notification_logs").insert({
      type: "sms",
      recipient: null,
      template_id: null,
      variables: { sms_type: type, count },
      status,
      response: null,
      error: error ?? null,
    });
  } catch {}
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: {
    type?: "sms" | "lms";
    to?: string | string[];
    text?: string;
    title?: string;
    boss_confirmed?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { type = "sms", to, text, title, boss_confirmed } = body;
  if (!to || !text) {
    return NextResponse.json({ error: "to, text 파라미터가 필요합니다." }, { status: 400 });
  }

  const recipients = Array.isArray(to) ? to : [to];

  if (recipients.length > MAX_BULK) {
    return NextResponse.json(
      { error: `${recipients.length}건은 최대 허용(${MAX_BULK}건)을 초과합니다.` },
      { status: 403 },
    );
  }
  if (recipients.length > 10 && !boss_confirmed) {
    return NextResponse.json(
      { error: `대량 발송(${recipients.length}건)은 boss_confirmed: true 필드가 필요합니다.` },
      { status: 403 },
    );
  }

  try {
    let results;
    if (recipients.length === 1) {
      const result =
        type === "lms" && title
          ? await sendLMS(recipients[0], title, text)
          : await sendSMS(recipients[0], text);
      results = [result];
    } else {
      results = await sendBulk(recipients.map((r) => ({ to: r })), text);
    }
    await logSms(type, recipients.length, "sent");
    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "발송 실패";
    await logSms(type, recipients.length, "failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { sendMessage, sendChannelPost, logNotification } from "@/lib/kakao-agent";

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: {
    type?: "alimtalk" | "channel_post";
    to?: string | string[];
    templateId?: string;
    variables?: Record<string, string>;
    title?: string;
    content?: string;
    imageUrl?: string;
    boss_confirmed?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { type, to, templateId, variables, title, content, imageUrl, boss_confirmed } = body;
  if (!type) return NextResponse.json({ error: "type 파라미터가 필요합니다." }, { status: 400 });

  const recipients = Array.isArray(to) ? to : to ? [to] : [];
  if (recipients.length > 10 && !boss_confirmed) {
    return NextResponse.json(
      { error: `대량 발송(${recipients.length}건)은 boss_confirmed: true 필드가 필요합니다.` },
      { status: 403 },
    );
  }

  try {
    if (type === "alimtalk") {
      if (recipients.length === 0 || !templateId) {
        return NextResponse.json({ error: "alimtalk 발송에는 to, templateId가 필요합니다." }, { status: 400 });
      }
      const results = [];
      for (const recipient of recipients) {
        const result = await sendMessage(recipient, templateId, variables ?? {});
        await logNotification("alimtalk", recipient, templateId, variables ?? null, "sent", result);
        results.push({ to: recipient, ...result });
      }
      return NextResponse.json({ success: true, results });
    }

    if (type === "channel_post") {
      if (!title || !content) {
        return NextResponse.json({ error: "channel_post에는 title, content가 필요합니다." }, { status: 400 });
      }
      await sendChannelPost(title, content, imageUrl);
      await logNotification("channel_post", null, null, { title }, "sent", null);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `알 수 없는 type: ${type as string}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "발송 실패";
    await logNotification(
      type as "alimtalk" | "channel_post",
      recipients[0] ?? null,
      templateId ?? null,
      null,
      "failed",
      null,
      message,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { publishPost } from "@/lib/blog-agent";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { logAgentEvent } from "@/lib/pipeline-logs";

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: {
    title?: string;
    content?: string;
    tags?: string[];
    category?: string;
    excerpt?: string;
    metaDescription?: string;
    scheduledAt?: string;
    boss_confirmed?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!body.boss_confirmed) {
    return NextResponse.json({ error: "boss_confirmed: true 필드가 필요합니다." }, { status: 403 });
  }
  if (!body.title || !body.content) {
    return NextResponse.json({ error: "title, content 파라미터가 필요합니다." }, { status: 400 });
  }

  try {
    const postId = await publishPost({
      title: body.title,
      content: body.content,
      tags: body.tags,
      category: body.category,
      excerpt: body.excerpt,
      metaDescription: body.metaDescription,
      scheduledAt: body.scheduledAt,
    });

    await logAgentEvent("info", "blog-publish-api", `블로그 발행: ${body.title}`, { postId });
    return NextResponse.json({ success: true, postId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "발행 실패";
    await logAgentEvent("error", "blog-publish-api", message, { title: body.title });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { notifyBlogReviewRequested } from "@/lib/kakao-publish";

// dk-blog-factory: 로컬 워커가 발행 패키지를 완성해 pending_review로 바꾼 뒤 호출하는
// 검토 요청 알림 엔드포인트 — SMS(ADMIN_ALERT_PHONE)로 대장에게 링크 발송.
// (video-jobs/notify-review와 동일 패턴 — 로컬 워커엔 Solapi 키가 없어 프로덕션이 대행)

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let jobId = "";
  try {
    const body = (await request.json()) as { jobId?: string };
    jobId = String(body.jobId ?? "").trim();
  } catch {
    // body 파싱 실패는 아래 400으로
  }
  if (!jobId) {
    return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
  }

  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("blog_jobs")
      .select("topic, status, draft, validation")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    }
    if (data.status !== "pending_review") {
      return NextResponse.json(
        { error: `발행 대기 상태가 아닙니다 (현재: ${data.status}).` },
        { status: 409 }
      );
    }
    const draft = data.draft as { title?: string } | null;
    const validation = data.validation as { score?: number } | null;
    await notifyBlogReviewRequested({
      topic: data.topic,
      title: draft?.title ?? null,
      validationScore: validation?.score ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알림 발송 실패" },
      { status: 500 }
    );
  }
}

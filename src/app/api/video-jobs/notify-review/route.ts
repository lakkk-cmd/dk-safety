import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { KAKAO_MEMO_ENABLED, notifyVideoReviewRequested } from "@/lib/kakao-publish";

// dk-video-factory: 로컬 워커가 렌더링을 마치고 pending_review로 바꾼 뒤 호출하는
// 검토 요청 알림 엔드포인트 — 카카오 "나에게 보내기" 메모로 대장에게 링크 발송.
// Solapi 키가 로컬 워커에는 없으므로, 발송은 프로덕션의 이 API가 대행한다.

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
  if (!KAKAO_MEMO_ENABLED) {
    return NextResponse.json({ skipped: true, reason: "카카오 연동이 설정되지 않았습니다." });
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
      .from("video_jobs")
      .select("topic, format, status, script")
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    }
    if (data.status !== "pending_review") {
      return NextResponse.json(
        { error: `승인 대기 상태가 아닙니다 (현재: ${data.status}).` },
        { status: 409 }
      );
    }
    const script = data.script as { title?: string } | null;
    await notifyVideoReviewRequested({
      topic: data.topic,
      title: script?.title ?? null,
      format: data.format,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알림 발송 실패" },
      { status: 500 }
    );
  }
}

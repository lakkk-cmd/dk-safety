// 클라이언트(hq/chat)에서 대화 종료 시 호출 — 관리자 쿠키 인증
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { saveAndSummarize } from "@/lib/chat-restore";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  let body: { session_id?: string; messages?: Array<{ role: string; content: string }> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { session_id, messages } = body;
  if (!session_id || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ skipped: true, reason: "저장할 내용이 없습니다." });
  }

  // fire-and-forget — 클라이언트 응답을 블로킹하지 않도록 await 없이 처리 후 즉시 응답
  saveAndSummarize(session_id, messages).catch(() => {});

  return NextResponse.json({ success: true, session_id });
}

import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { completeImprovementRequest, failImprovementRequest } from "@/lib/improvement-requests";

export const maxDuration = 30;

/** GH Actions 워크플로우 콜백 — 개선 요청 PR 배포 완료/실패를 기록한다. */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { issueNumber?: number; prUrl?: string; error?: string };
    if (!body.issueNumber) {
      return NextResponse.json({ message: "issueNumber 필요" }, { status: 400 });
    }

    if (body.error) {
      await failImprovementRequest(body.issueNumber, body.error);
      return NextResponse.json({ message: "실패 상태로 갱신되었습니다." });
    }

    const updated = await completeImprovementRequest(body.issueNumber, body.prUrl ?? "");
    if (!updated) {
      return NextResponse.json(
        { message: `이슈 #${body.issueNumber}에 해당하는 요청을 찾을 수 없습니다.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ item: updated });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "처리 실패" }, { status: 500 });
  }
}

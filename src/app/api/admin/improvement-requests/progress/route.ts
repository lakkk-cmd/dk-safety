import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { updateImprovementRequestProgress, type ImprovementRequestStatus } from "@/lib/improvement-requests";

export const maxDuration = 30;

const VALID_PROGRESS_STATUSES: ImprovementRequestStatus[] = ["in_progress", "reviewing", "deploying", "failed"];

/** GH Actions 워크플로우 콜백 — 자동구현 파이프라인의 중간 진행상황(구현중/리뷰중/배포중)을 기록한다. */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { issueNumber?: number; status?: string; message?: string };
    if (!body.issueNumber || !body.status) {
      return NextResponse.json({ message: "issueNumber와 status가 필요합니다." }, { status: 400 });
    }
    if (!VALID_PROGRESS_STATUSES.includes(body.status as ImprovementRequestStatus)) {
      return NextResponse.json({ message: `허용되지 않은 status: ${body.status}` }, { status: 400 });
    }

    await updateImprovementRequestProgress(body.issueNumber, body.status as ImprovementRequestStatus, body.message);
    return NextResponse.json({ message: "진행상황이 갱신되었습니다." });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "처리 실패" }, { status: 500 });
  }
}

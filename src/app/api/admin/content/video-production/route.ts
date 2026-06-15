import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { produceVideoAssets } from "@/lib/video-pipeline";

// Claude 씬 분해 1회 + Flux 이미지 최대 8장 생성으로 시간이 걸릴 수 있음
export const maxDuration = 300;

/** 승인된(approved) 유튜브 큐 항목의 스크립트를 씬으로 분해하고 Flux 이미지를 생성 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ message: "OPENROUTER_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { queueId?: string };
    const queueId = body.queueId?.trim();
    if (!queueId) {
      return NextResponse.json({ message: "queueId 파라미터가 필요합니다." }, { status: 400 });
    }

    const result = await produceVideoAssets(queueId);
    return NextResponse.json({
      message: `씬 ${result.scenes.length}개의 이미지 생성이 완료되었습니다. GitHub Actions가 영상을 합성합니다.`,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "영상 자산 생성 실패" },
      { status: 500 },
    );
  }
}

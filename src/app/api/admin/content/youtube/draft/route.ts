import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runYoutubeDrafting } from "@/lib/content-pipeline";

// 씬 이미지 생성까지 포함될 수 있어(Gemini 검수 통과 시 produceVideoAssets 자동 트리거) 여유를 둠
export const maxDuration = 300;

/**
 * 관리자가 "지금 유튜브 영상 N개 더" 요청할 때 쓰는 수동 트리거 —
 * 화/수요일 정기 배치(runContentDrafting, 카카오·블로그도 함께 처리)와 달리 유튜브만 처리한다.
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as { count?: number };
  const count = Number.isFinite(body.count) && Number(body.count) > 0 ? Math.min(Math.round(Number(body.count)), 5) : 2;

  try {
    const result = await runYoutubeDrafting(count);
    return NextResponse.json({ message: "유튜브 초안 생성 완료", result });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "초안 생성 실패" },
      { status: 500 },
    );
  }
}

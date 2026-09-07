import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { generateKakaoCardNews } from "@/lib/kakao-card-news";

export const maxDuration = 60;

/** 카카오 큐 항목 하나의 카드뉴스 5장을 생성한다(hq/kakao 승인화면의 "카드뉴스 생성" 버튼). */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ message: "id 파라미터 필요" }, { status: 400 });

  try {
    const { images } = await generateKakaoCardNews(body.id);
    return NextResponse.json({ message: "카드뉴스 5장을 생성했습니다.", images });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "카드뉴스 생성 실패" },
      { status: 500 },
    );
  }
}

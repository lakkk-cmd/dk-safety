import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { FAL_TTS_ENABLED, synthesizeSpeechFal } from "@/lib/fal-tts";

export const maxDuration = 60;

// 답변 하나가 과도하게 길 때 비용/생성시간이 무한정 늘어나지 않도록 하는 안전장치 —
// 실사용 hq 채팅 답변은 보통 500~2000자라 이 한도에 걸릴 일이 드물다.
const MAX_CHARS = 4000;

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!FAL_TTS_ENABLED) {
    return NextResponse.json({ message: "FAL_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ message: "text가 필요합니다." }, { status: 400 });
    }

    const result = await synthesizeSpeechFal(text.slice(0, MAX_CHARS));
    return NextResponse.json({ audioUrl: result.url, durationSec: result.durationSec });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "음성 생성 실패" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireAgentSupabase } from "@/lib/agent-db";
import { produceAiBgSceneFlux, type VideoScene } from "@/lib/video-pipeline";

// 씬 1개만 Flux로 생성 — GitHub Actions(flux-complete.yml)가 씬별로 나눠 호출해
// Vercel 함수 시간제한(전체 씬을 한 요청에서 순차 생성하면 504가 남)을 피한다.
// OCR 재시도가 최대 2회(각 최대 90s)라 여유를 두고 280으로 올렸다.
export const maxDuration = 280;

function checkAuth(request: Request): boolean {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("Authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ message: "인증 실패" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { queueId?: string; sceneIndex?: number };
    const queueId = body.queueId?.trim();
    const sceneIndex = body.sceneIndex;
    if (!queueId || typeof sceneIndex !== "number") {
      return NextResponse.json({ message: "queueId, sceneIndex 파라미터가 필요합니다." }, { status: 400 });
    }

    const supabase = requireAgentSupabase();
    const { data: row, error } = await supabase
      .from("content_youtube_queue")
      .select("id, scenes")
      .eq("id", queueId)
      .single();
    if (error || !row) {
      return NextResponse.json({ message: "큐 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const scenes = (row.scenes ?? []) as VideoScene[];
    const scene = scenes[sceneIndex];
    if (!scene) {
      return NextResponse.json({ message: `씬 인덱스 ${sceneIndex}가 없습니다.` }, { status: 400 });
    }
    if (scene.imageUrl) {
      return NextResponse.json({ message: "이미 생성됨 (스킵)", skipped: true });
    }

    const bucket = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
    const { imageUrl } = await produceAiBgSceneFlux(scene, queueId, sceneIndex, bucket);

    scenes[sceneIndex] = { ...scene, imageUrl };
    await supabase
      .from("content_youtube_queue")
      .update({ scenes, updated_at: new Date().toISOString() })
      .eq("id", queueId)
      .throwOnError();

    return NextResponse.json({ message: `씬 ${sceneIndex + 1} 생성 완료`, imageUrl });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "씬 생성 실패" },
      { status: 500 },
    );
  }
}

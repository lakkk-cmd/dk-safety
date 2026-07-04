import { NextResponse } from "next/server";
import { requireAgentSupabase } from "@/lib/agent-db";
import { dispatchGithubWorkflow } from "@/lib/github-issues";
import type { VideoScene } from "@/lib/video-pipeline";

// flux-complete.yml이 모든 씬 이미지 생성을 마친 뒤 호출 — assets_ready로 전환.
export const maxDuration = 30;

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
    const body = (await request.json()) as { queueId?: string };
    const queueId = body.queueId?.trim();
    if (!queueId) {
      return NextResponse.json({ message: "queueId 파라미터가 필요합니다." }, { status: 400 });
    }

    const supabase = requireAgentSupabase();
    const { data: row, error } = await supabase
      .from("content_youtube_queue")
      .select("id, scenes, status")
      .eq("id", queueId)
      .single();
    if (error || !row) {
      return NextResponse.json({ message: "큐 항목을 찾을 수 없습니다." }, { status: 404 });
    }

    const scenes = (row.scenes ?? []) as VideoScene[];
    const missing = scenes
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (s.sceneType ?? "ai_bg") === "ai_bg" && !s.imageUrl);

    if (missing.length > 0) {
      return NextResponse.json(
        { message: `아직 이미지가 없는 씬이 있습니다: ${missing.map((m) => m.i + 1).join(", ")}` },
        { status: 409 },
      );
    }

    await supabase
      .from("content_youtube_queue")
      .update({ status: "assets_ready", updated_at: new Date().toISOString() })
      .eq("id", queueId)
      .throwOnError();

    // 사람이 GitHub Actions에서 직접 눌러야 했던 최종 합성+업로드 단계를 자동 트리거한다.
    await dispatchGithubWorkflow("video-assembly.yml");

    return NextResponse.json({ message: "모든 씬 이미지 생성 완료. assets_ready로 전환 + 영상 합성 자동 트리거됨." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "완료 처리 실패" },
      { status: 500 },
    );
  }
}

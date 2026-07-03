import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { produceVideoAssets } from "@/lib/video-pipeline";

// Veo 비동기: Claude 씬 분해 + LRO 제출만 (~30s). Flux 동기: 이미지 최대 8장 (~240s).
export const maxDuration = 300;

async function triggerCompleteWorkflow(workflowFile: string, queueId: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = (process.env.GITHUB_REPO?.trim()) || "lakkk-cmd/dk-safety";
  if (!token) {
    console.warn(`[${workflowFile}] GITHUB_TOKEN 없음 — schedule 폴백 사용`);
    return;
  }
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { queue_id: queueId } }),
    },
  );
  if (!res.ok) {
    console.warn(`[${workflowFile}] GitHub Actions 트리거 실패 ${res.status}: ${await res.text().then(t => t.slice(0,100))}`);
  } else {
    console.log(`[${workflowFile}] GitHub Actions 트리거 완료 → queue_id: ${queueId}`);
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
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

    // Veo 비동기 경로: GitHub Actions에 완료 위임
    if (result.veoAsync) {
      await triggerCompleteWorkflow("veo-complete.yml", queueId).catch((e) =>
        console.error("[veo-complete] dispatch 오류:", e),
      );
      return NextResponse.json({
        message: `씬 ${result.scenes.length}개 계획 완료. Veo 영상 생성 중 (GitHub Actions)...`,
        ...result,
      });
    }

    // Flux 비동기 경로: 씬 계획만 동기로 끝내고 이미지 생성은 GitHub Actions에 위임
    // (전체 씬을 이 요청 안에서 순차 생성하면 Vercel 함수 시간제한을 넘겨 504가 나던 문제 수정)
    if (result.fluxAsync) {
      await triggerCompleteWorkflow("flux-complete.yml", queueId).catch((e) =>
        console.error("[flux-complete] dispatch 오류:", e),
      );
      return NextResponse.json({
        message: `씬 ${result.scenes.length}개 계획 완료. 이미지 생성 중 (GitHub Actions)...`,
        ...result,
      });
    }

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

import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runMarketIntelligenceCollection } from "@/lib/market-intelligence";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";
import { notifyPipelineFailure } from "@/lib/kakao-publish";

export const maxDuration = 300;

const PIPELINE = "market-intelligence";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json(
      { success: false, error: "Supabase URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정" },
      { status: 500 },
    );
  }

  const runId = await startPipelineRun(PIPELINE);

  try {
    const results = await runMarketIntelligenceCollection();

    const totalCollected = results.reduce((sum, r) => sum + r.collected, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
    const allErrors = results.flatMap((r) => r.errors.map((e) => `[${r.category}] ${e}`));

    await logAgentEvent(
      allErrors.length > 0 ? "warn" : "info",
      PIPELINE,
      `3개 카테고리 수집 완료 (수집 ${totalCollected}, 스킵 ${totalSkipped}, 오류 ${allErrors.length})`,
    );
    await finishPipelineRun(runId, "success", { totalCollected, totalSkipped, errors: allErrors });

    return NextResponse.json({ success: true, pipeline: PIPELINE, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAgentEvent("error", PIPELINE, `파이프라인 실패: ${message}`);
    await finishPipelineRun(runId, "failed", { error: message });
    await notifyPipelineFailure(PIPELINE, message).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

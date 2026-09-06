import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runSwotAnalysis } from "@/lib/swot-analysis";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";

export const maxDuration = 180;

const PIPELINE = "swot-analysis";

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

  // pipeline_logs 'started' 행은 분석 완료 후에 기록한다 — daily-business-scan에서 겪은
  // 자기참조 좀비 오탐(2026-09-06 발견)과 같은 패턴을 처음부터 피하기 위함.
  try {
    const analysis = await runSwotAnalysis();
    const runId = await startPipelineRun(PIPELINE);
    await logAgentEvent(
      "info",
      PIPELINE,
      `SWOT/TOWS 분석 완료 (${analysis.quarter_label}, 강점${analysis.strengths.length}·약점${analysis.weaknesses.length}·기회${analysis.opportunities.length}·위협${analysis.threats.length})`,
    );
    await finishPipelineRun(runId, "success", { quarterLabel: analysis.quarter_label });
    return NextResponse.json({ success: true, pipeline: PIPELINE, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const runId = await startPipelineRun(PIPELINE);
    await logAgentEvent("error", PIPELINE, `파이프라인 실패: ${message}`);
    await finishPipelineRun(runId, "failed", { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

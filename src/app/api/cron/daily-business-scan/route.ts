import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runDailyBusinessScan } from "@/lib/daily-scan";
import { KAKAO_MEMO_ENABLED, notifyDailyBusinessScan } from "@/lib/kakao-publish";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";

export const maxDuration = 120;

const PIPELINE = "daily-business-scan";

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
    const report = await runDailyBusinessScan();

    let kakaoSent = false;
    if (KAKAO_MEMO_ENABLED) {
      await notifyDailyBusinessScan(report);
      kakaoSent = true;
    }

    await logAgentEvent(
      report.anomalies.length > 0 ? "warn" : "info",
      PIPELINE,
      `아침 스캔 완료 (이상신호 ${report.anomalies.length}건, 성장기회 ${report.opportunities.length}건, 카톡발송 ${kakaoSent})`,
    );
    await finishPipelineRun(runId, "success", {
      anomalies: report.anomalies.length,
      opportunities: report.opportunities.length,
      kakaoSent,
    });

    return NextResponse.json({ success: true, pipeline: PIPELINE, report, kakaoSent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAgentEvent("error", PIPELINE, `파이프라인 실패: ${message}`);
    await finishPipelineRun(runId, "failed", { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runDailyBusinessScan } from "@/lib/daily-scan";
import { KAKAO_MEMO_ENABLED, notifyDailyBusinessScan, notifyPipelineFailure } from "@/lib/kakao-publish";
import { cleanupStalePipelineRuns, finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";

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

  const staleRuns = await cleanupStalePipelineRuns();
  if (staleRuns.length > 0) {
    await logAgentEvent(
      "warn",
      PIPELINE,
      `좀비 pipeline_logs ${staleRuns.length}건 자동 타임아웃 처리: ${staleRuns.map((r) => r.pipeline).join(", ")}`,
    );
  }

  // pipeline_logs 'started' 행을 조사 시작 "전"에 만들지 않는다 — runDailyBusinessScan()의
  // 읽기전용 조사 툴이 그 도중 pipeline_logs를 조회하면 방금 만든 자기 자신의 미완료 행을
  // "좀비 파이프라인"으로 오인해, 2026-08-20~09-05까지 최소 16일 연속 거짓 이상신호를
  // 보고한 원인이었다(2026-09-06 발견·검증). 조사가 끝난 뒤 시작+종료를 한 번에 기록한다 —
  // 서버리스 자체가 중간에 강제 종료되는 경우는 이전 코드에서도 finishPipelineRun이 실행될
  // 기회가 없었으므로(try/catch로 못 잡음) 보호 수준은 그대로다.
  try {
    const report = await runDailyBusinessScan();
    const analysisFailed = report.summary === "분석 실패";
    const runId = await startPipelineRun(PIPELINE);

    // 분석 자체가 실패했으면(조사만 하다 결론을 못 낸 경우) 의미 없는 카톡을 보내는 대신
    // 파이프라인 실패로 남겨 다음 스캔/사람 확인으로 이어지게 한다.
    let kakaoSent = false;
    if (!analysisFailed && KAKAO_MEMO_ENABLED) {
      await notifyDailyBusinessScan(report);
      kakaoSent = true;
    }

    await logAgentEvent(
      analysisFailed || report.anomalies.length > 0 ? "warn" : "info",
      PIPELINE,
      `아침 스캔 완료 (이상신호 ${report.anomalies.length}건, 성장기회 ${report.opportunities.length}건, 조사도구 ${report.toolCallCount}회 호출, 카톡발송 ${kakaoSent}${analysisFailed ? ", 분석실패로 미발송" : ""})`,
    );
    await finishPipelineRun(runId, analysisFailed ? "failed" : "success", {
      anomalies: report.anomalies.length,
      opportunities: report.opportunities.length,
      toolCallCount: report.toolCallCount,
      kakaoSent,
      analysisFailed,
    });

    return NextResponse.json({ success: !analysisFailed, pipeline: PIPELINE, report, kakaoSent });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const runId = await startPipelineRun(PIPELINE);
    await logAgentEvent("error", PIPELINE, `파이프라인 실패: ${message}`);
    await finishPipelineRun(runId, "failed", { error: message });
    await notifyPipelineFailure(PIPELINE, message).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

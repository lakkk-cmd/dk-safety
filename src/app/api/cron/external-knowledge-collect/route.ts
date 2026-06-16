import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runExternalKnowledgeCollection } from "@/lib/external-knowledge";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "OPENROUTER_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ success: false, error: "Supabase 미설정" }, { status: 500 });
  }

  const runId = await startPipelineRun("external-knowledge-collect");

  try {
    const results = await runExternalKnowledgeCollection();

    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
    const errors = results.filter((r) => r.error).map((r) => `[${r.category}] ${r.error}`);

    await logAgentEvent(
      errors.length > 0 ? "warn" : "info",
      "external-knowledge-collect",
      `7개 카테고리 외부 지식 수집 완료 (삽입 ${totalInserted}, 삭제 ${totalDeleted}, 오류 ${errors.length})`,
    );
    await finishPipelineRun(runId, "success", { totalInserted, totalDeleted, errors });

    return NextResponse.json({ success: true, results, totalInserted, totalDeleted, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAgentEvent("error", "external-knowledge-collect", `수집 실패: ${msg}`);
    await finishPipelineRun(runId, "failed", { error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

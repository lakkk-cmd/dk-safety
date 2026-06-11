import { requireAgentSupabase } from "@/lib/agent-db";

export type AgentLogLevel = "debug" | "info" | "warn" | "error";

/** agent_logs에 실행 로그 기록. 실패해도 파이프라인 흐름에 영향 없도록 예외를 삼킴 */
export async function logAgentEvent(
  level: AgentLogLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = requireAgentSupabase();
    const { error } = await supabase.from("agent_logs").insert({ level, source, message, meta: meta ?? {} });
    if (error) throw error;
  } catch (err) {
    console.error(`[agent_logs] ${source} 기록 실패:`, err);
  }
}

/** pipeline_logs에 실행 시작 기록. 반환된 id를 finishPipelineRun에 전달 */
export async function startPipelineRun(pipeline: string, detail?: Record<string, unknown>): Promise<string | null> {
  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("pipeline_logs")
      .insert({ pipeline, status: "started", detail: detail ?? {} })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  } catch (err) {
    console.error(`[pipeline_logs] ${pipeline} 시작 기록 실패:`, err);
    return null;
  }
}

/** pipeline_logs 실행 결과 갱신. id가 null이면(시작 기록 실패) 아무 작업도 하지 않음 */
export async function finishPipelineRun(
  id: string | null,
  status: "success" | "failed",
  detail?: Record<string, unknown>,
): Promise<void> {
  if (!id) return;
  try {
    const supabase = requireAgentSupabase();
    const { error } = await supabase
      .from("pipeline_logs")
      .update({ status, finished_at: new Date().toISOString(), detail: detail ?? {} })
      .eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error(`[pipeline_logs] ${id} 종료 기록 실패:`, err);
  }
}

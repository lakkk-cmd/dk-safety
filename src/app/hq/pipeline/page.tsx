import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

type AgentLog = {
  id: string;
  created_at: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
};

type PipelineLog = {
  id: string;
  pipeline: string;
  status: "started" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
};

async function loadLogs(): Promise<{ agentLogs: AgentLog[]; pipelineLogs: PipelineLog[]; error: string | null }> {
  if (!isAgentSupabaseReady()) {
    return { agentLogs: [], pipelineLogs: [], error: null };
  }
  try {
    const supabase = requireAgentSupabase();
    const [agentLogsRes, pipelineLogsRes] = await Promise.all([
      supabase
        .from("agent_logs")
        .select("id, created_at, level, source, message")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("pipeline_logs")
        .select("id, pipeline, status, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(30),
    ]);
    const error = [agentLogsRes.error, pipelineLogsRes.error].map((e) => e?.message).find(Boolean) ?? null;
    return {
      agentLogs: (agentLogsRes.data ?? []) as AgentLog[],
      pipelineLogs: (pipelineLogsRes.data ?? []) as PipelineLog[],
      error,
    };
  } catch (err) {
    return { agentLogs: [], pipelineLogs: [], error: err instanceof Error ? err.message : "조회 실패" };
  }
}

const LEVEL_BADGE: Record<AgentLog["level"], string> = {
  debug: "bg-slate-100 text-slate-600",
  info: "bg-sky-100 text-sky-800",
  warn: "bg-cc-gold/10 text-cc-navy",
  error: "bg-cc-red/10 text-cc-red",
};

const PIPELINE_STATUS_BADGE: Record<PipelineLog["status"], string> = {
  started: "bg-sky-100 text-sky-800",
  success: "bg-cc-green/10 text-cc-green",
  failed: "bg-cc-red/10 text-cc-red",
};

export default async function HqPipelinePage() {
  const ready = isAgentSupabaseReady();
  const { agentLogs, pipelineLogs, error } = await loadLogs();

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          파이프라인 로그
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">자동화 실행 이력</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          유튜브 수집·Gemini 분석·콘텐츠 기획/초안·승인 알림 등 Cron 파이프라인의 실행 기록입니다. YouTube 상세 현황은
          agent.dkansim.com에서 확인할 수 있습니다.
        </p>
      </header>

      {!ready ? (
        <p className="cc-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Supabase가 설정되지 않았습니다. <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 확인하세요.
        </p>
      ) : error ? (
        <p className="cc-card border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>
      ) : null}

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">파이프라인 실행 이력</h2>
        <p className="mt-1 text-sm text-slate-600">자동화 파이프라인 실행 기록(pipeline_logs)입니다.</p>
        {pipelineLogs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">실행 이력이 없습니다.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">파이프라인</th>
                  <th className="py-2 pr-4">상태</th>
                  <th className="py-2 pr-4">시작</th>
                  <th className="py-2 pr-4">종료</th>
                </tr>
              </thead>
              <tbody>
                {pipelineLogs.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-semibold text-cc-text">{p.pipeline}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${PIPELINE_STATUS_BADGE[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{new Date(p.started_at).toLocaleString("ko-KR")}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {p.finished_at ? new Date(p.finished_at).toLocaleString("ko-KR") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">Cron 실행 로그</h2>
        <p className="mt-1 text-sm text-slate-600">AI 에이전트 실행 로그(agent_logs) 최근 {agentLogs.length}건입니다.</p>
        {agentLogs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">기록된 로그가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {agentLogs.map((l) => (
              <li key={l.id} className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${LEVEL_BADGE[l.level]}`}>{l.level}</span>
                  <span className="font-semibold text-cc-text">{l.source}</span>
                  <span className="ml-auto">{new Date(l.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-2 text-sm text-cc-text">{l.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

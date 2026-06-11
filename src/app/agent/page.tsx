import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

type YoutubeChannel = {
  id: string;
  channel_id: string;
  channel_name: string;
  url: string | null;
  active: boolean;
  created_at: string;
};

type YoutubeVideo = {
  id: string;
  channel_id: string;
  video_id: string;
  title: string | null;
  published_at: string | null;
  fetched_at: string;
};

type YoutubeInsight = {
  id: string;
  video_id: string;
  summary: string | null;
  model: string | null;
  created_at: string;
};

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

type DashboardData = {
  channels: YoutubeChannel[];
  videos: YoutubeVideo[];
  insights: YoutubeInsight[];
  agentLogs: AgentLog[];
  pipelineLogs: PipelineLog[];
  error: string | null;
};

const EMPTY_DATA: DashboardData = {
  channels: [],
  videos: [],
  insights: [],
  agentLogs: [],
  pipelineLogs: [],
  error: null,
};

async function loadDashboardData(): Promise<DashboardData> {
  if (!isAgentSupabaseReady()) {
    return EMPTY_DATA;
  }
  try {
    const supabase = requireAgentSupabase();
    const [channelsRes, videosRes, insightsRes, agentLogsRes, pipelineLogsRes] = await Promise.all([
      supabase
        .from("youtube_channels")
        .select("id, channel_id, channel_name, url, active, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("youtube_videos")
        .select("id, channel_id, video_id, title, published_at, fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(50),
      supabase
        .from("youtube_insights")
        .select("id, video_id, summary, model, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("agent_logs")
        .select("id, created_at, level, source, message")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("pipeline_logs")
        .select("id, pipeline, status, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

    const error =
      [channelsRes.error, videosRes.error, insightsRes.error, agentLogsRes.error, pipelineLogsRes.error]
        .map((e) => e?.message)
        .find(Boolean) ?? null;

    return {
      channels: (channelsRes.data ?? []) as YoutubeChannel[],
      videos: (videosRes.data ?? []) as YoutubeVideo[],
      insights: (insightsRes.data ?? []) as YoutubeInsight[],
      agentLogs: (agentLogsRes.data ?? []) as AgentLog[],
      pipelineLogs: (pipelineLogsRes.data ?? []) as PipelineLog[],
      error,
    };
  } catch (err) {
    return { ...EMPTY_DATA, error: err instanceof Error ? err.message : "조회 실패" };
  }
}

const LEVEL_BADGE: Record<AgentLog["level"], string> = {
  debug: "bg-slate-100 text-slate-600",
  info: "bg-sky-100 text-sky-800",
  warn: "bg-amber-100 text-amber-900",
  error: "bg-rose-100 text-rose-800",
};

const PIPELINE_STATUS_BADGE: Record<PipelineLog["status"], string> = {
  started: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
};

export default async function AgentPage() {
  const ready = isAgentSupabaseReady();
  const { channels, videos, insights, agentLogs, pipelineLogs, error } = await loadDashboardData();

  return (
    <main className="space-y-6">
      <header className="warranty-band rounded-[2rem] p-6 md:p-8">
        <p className="warranty-badge">AI 파이프라인 모니터</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">
          YouTube · Gemini 인사이트 파이프라인
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700">
          유튜브 채널 수집, Gemini 분석, 자동화 파이프라인 실행 현황을 확인합니다.
        </p>
      </header>

      {!ready ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Supabase가 설정되지 않았습니다. <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 확인하세요.
        </p>
      ) : error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">YouTube 수집 현황</h2>
        <p className="mt-1 text-sm text-slate-600">등록된 채널과 채널별 수집 영상 수입니다.</p>
        {channels.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">등록된 채널이 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {channels.map((c) => {
              const channelVideos = videos.filter((v) => v.channel_id === c.id);
              const latest = channelVideos[0]?.fetched_at;
              return (
                <li key={c.id} className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{c.channel_name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                        c.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {c.active ? "활성" : "비활성"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    수집 영상 {channelVideos.length}건
                    {latest ? ` · 최근 수집 ${new Date(latest).toLocaleString("ko-KR")}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Gemini 분석 현황</h2>
        <p className="mt-1 text-sm text-slate-600">최근 영상별 Gemini 분석 결과입니다.</p>
        {insights.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">아직 분석 결과가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {insights.map((i) => (
              <li key={i.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{i.model ?? "model 미상"}</span>
                  <span>{new Date(i.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-slate-700">
                  {i.summary ?? "(요약 없음)"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Cron 실행 로그</h2>
        <p className="mt-1 text-sm text-slate-600">AI 에이전트 실행 로그(agent_logs) 최근 {agentLogs.length}건입니다.</p>
        {agentLogs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">기록된 로그가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {agentLogs.map((l) => (
              <li key={l.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded px-1.5 py-0.5 font-bold uppercase ${LEVEL_BADGE[l.level]}`}>{l.level}</span>
                  <span className="font-semibold text-slate-700">{l.source}</span>
                  <span className="ml-auto">{new Date(l.created_at).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{l.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">파이프라인 실행 이력</h2>
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
                    <td className="py-2 pr-4 font-semibold text-slate-900">{p.pipeline}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${PIPELINE_STATUS_BADGE[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {new Date(p.started_at).toLocaleString("ko-KR")}
                    </td>
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
    </main>
  );
}

import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { ROADMAP, getCurrentWeekStatus } from "@/lib/agents";

export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  created_at: string;
  date_label: string;
  chief_summary: string | null;
  approved: boolean;
  approved_at: string | null;
};

async function loadReports(): Promise<{ reports: ReportRow[]; error: string | null }> {
  if (!isAgentSupabaseReady()) {
    return { reports: [], error: null };
  }
  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("agent_reports")
      .select("id, created_at, date_label, chief_summary, approved, approved_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return { reports: [], error: error.message };
    return { reports: (data ?? []) as ReportRow[], error: null };
  } catch (err) {
    return { reports: [], error: err instanceof Error ? err.message : "조회 실패" };
  }
}

function fmtWon(n: number) {
  return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원`;
}

export default async function ReportPage() {
  const ready = isAgentSupabaseReady();
  const { reports, error } = await loadReports();
  const status = getCurrentWeekStatus();
  const yearData = ROADMAP.years.find((y) => y.year === status.year) ?? ROADMAP.years[0];
  const maxQuarterTarget = Math.max(...yearData.quarters.map((q) => q.target));

  return (
    <main className="space-y-6">
      <header className="warranty-band rounded-[2rem] p-6 md:p-8">
        <p className="warranty-badge">3년 로드맵 진행 현황</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">
          {yearData.label} · {status.quarterLabel}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700">{status.message}</p>
        <p className="mt-1 text-xs text-slate-500">연간 목표 {fmtWon(yearData.revenueTarget)} · 핵심 과제: {yearData.focus}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{yearData.label} 분기별 목표</h2>
        <p className="mt-1 text-sm text-slate-600">실제 매출 실적은 별도 집계 전이며, 막대는 분기별 목표 비중을 나타냅니다.</p>
        <div className="mt-4 space-y-3">
          {yearData.quarters.map((q) => {
            const widthPct = Math.max(6, Math.round((q.target / maxQuarterTarget) * 100));
            const isCurrent = q.q === status.quarter;
            return (
              <div key={q.q}>
                <div className="flex items-center justify-between text-sm">
                  <span className={isCurrent ? "font-bold text-slate-900" : "text-slate-700"}>
                    {q.label}
                    {isCurrent ? <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">현재 분기</span> : null}
                  </span>
                  <span className="text-slate-600">{fmtWon(q.target)}</span>
                </div>
                <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={isCurrent ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-slate-300"}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          이번 주({status.week}주차) 목표: <strong>{fmtWon(status.weeklyTarget)}</strong>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">경영진 보고서 아카이브</h2>
        <p className="mt-1 text-sm text-slate-600">매주 토요일 08:00 회의 결과 중 콘텐츠 승인된 보고서입니다.</p>

        {!ready ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            Supabase가 설정되지 않았습니다. <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 확인하세요.
          </p>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.filter((r) => r.approved).length === 0 ? (
              <li className="text-sm text-slate-500">아직 승인된 보고서가 없습니다. hq.dkansim.com에서 콘텐츠 승인을 진행해 주세요.</li>
            ) : (
              reports
                .filter((r) => r.approved)
                .map((r) => (
                  <li key={r.id} className="rounded-xl border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">{r.date_label}</span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">승인됨</span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
                      {r.chief_summary ?? "(총괄 요약 없음)"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      회의일 {new Date(r.created_at).toLocaleString("ko-KR")}
                      {r.approved_at ? ` · 승인일 ${new Date(r.approved_at).toLocaleString("ko-KR")}` : ""}
                    </p>
                  </li>
                ))
            )}
          </ul>
        )}
      </section>
    </main>
  );
}

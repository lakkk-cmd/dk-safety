import { getLatestDailyBusinessScan } from "@/lib/daily-scan";

/** 매일 아침 이상신호+성장기회 스캔 — 카톡으로 이미 발송되지만, hq 홈에서도 다시 볼 수 있게 */
export default async function DailyScanCard() {
  const report = await getLatestDailyBusinessScan().catch(() => null);
  if (!report) return null;

  const hasAnomalies = report.anomalies.length > 0;
  const hasOpportunities = report.opportunities.length > 0;

  return (
    <details className="cc-card p-5">
      <summary className="cursor-pointer text-base font-black text-cc-text">
        🌅 오늘 아침 스캔 ({new Date(report.created_at).toLocaleDateString("ko-KR")})
        {hasAnomalies ? (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
            이상신호 {report.anomalies.length}건
          </span>
        ) : (
          <span className="ml-2 rounded bg-cc-green/10 px-1.5 py-0.5 text-xs font-bold text-cc-green">정상</span>
        )}
        {hasOpportunities ? (
          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-bold text-sky-900">
            성장기회 {report.opportunities.length}건
          </span>
        ) : null}
      </summary>

      <div className="mt-3 space-y-3 text-sm">
        <p className="text-slate-700">{report.summary}</p>

        {hasAnomalies && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">⚠️ 이상신호</p>
            {report.anomalies.map((a, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-3">
                <p className="text-xs font-bold text-cc-navy">{a.title}</p>
                <p className="mt-1 text-xs text-slate-600">{a.description}</p>
              </div>
            ))}
          </div>
        )}

        {hasOpportunities && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">💡 성장기회</p>
            {report.opportunities.map((o, i) => (
              <div key={i} className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                <p className="text-xs font-bold text-cc-navy">{o.title}</p>
                <p className="mt-1 text-xs text-slate-600">{o.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

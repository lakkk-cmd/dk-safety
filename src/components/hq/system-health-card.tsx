import { getLatestSystemHealthReport } from "@/lib/system-health";

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-cc-red/10 text-cc-red",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-slate-100 text-slate-600",
};

/** Full 에이전트 주간 자가점검 — 강제 알림이 아닌, 필요할 때 열어보는 카드 */
export default async function SystemHealthCard() {
  const report = await getLatestSystemHealthReport().catch(() => null);
  if (!report) return null;

  const hasFindings = report.findings.length > 0;

  return (
    <details className="cc-card p-5">
      <summary className="cursor-pointer text-base font-black text-cc-text">
        🩺 주간 시스템 점검 ({new Date(report.created_at).toLocaleDateString("ko-KR")})
        {hasFindings ? (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
            확인 필요 {report.findings.length}건
          </span>
        ) : (
          <span className="ml-2 rounded bg-cc-green/10 px-1.5 py-0.5 text-xs font-bold text-cc-green">정상</span>
        )}
      </summary>

      <div className="mt-3 space-y-3 text-sm">
        <p className="text-slate-700">{report.summary}</p>

        {hasFindings && (
          <div className="space-y-2">
            {report.findings.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cc-navy">{f.area}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${SEVERITY_BADGE[f.severity] ?? SEVERITY_BADGE.low}`}>
                    {f.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{f.description}</p>
              </div>
            ))}
          </div>
        )}

        {report.delegation_prompts.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">위임 필요 — Claude Code 프롬프트</p>
            {report.delegation_prompts.map((d, i) => (
              <div key={i}>
                <p className="mb-1 text-xs font-bold text-cc-text">{d.title}</p>
                <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100 whitespace-pre-wrap">
                  {d.prompt}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

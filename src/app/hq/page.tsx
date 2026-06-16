import Link from "next/link";
import { getHqSummary } from "@/lib/hq-summary";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  waiting_payment: "입금대기",
  접수: "접수",
  진행중: "진행중",
  완료: "완료",
};

const STATUS_BADGE: Record<string, string> = {
  waiting_payment: "bg-slate-100 text-slate-600",
  접수: "bg-sky-100 text-sky-800",
  진행중: "bg-amber-100 text-amber-900",
  완료: "bg-cc-green/10 text-cc-green",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

export default async function HqPage() {
  const summary = await getHqSummary();
  const { reservations, content, improvements, feedback, pipeline, report } = summary;

  const notifications: { label: string; count: number; href: string }[] = [
    { label: "유튜브 승인 대기", count: content.pending.youtube, href: "/content" },
    { label: "카카오 승인 대기", count: content.pending.kakao, href: "/content" },
    { label: "블로그 승인 대기", count: content.pending.blog, href: "/content" },
    { label: "개선 요청 미확인", count: improvements.unacknowledged, href: "/improve" },
    { label: "대장 피드백 대기", count: feedback.pending, href: "/report" },
  ].filter((n) => n.count > 0);

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          DASHBOARD
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">
          오늘({summary.today}) 현황
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {summary.weekStatus.message} · {summary.scheduleSummary}
        </p>
      </header>

      <section>
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">알림</h2>
        {notifications.length === 0 ? (
          <p className="cc-card mt-3 p-4 text-sm text-slate-500">새 알림이 없습니다.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {notifications.map((n) => (
              <li key={n.label}>
                <Link
                  href={n.href}
                  className="cc-card flex min-h-12 items-center justify-between gap-3 p-4 transition hover:shadow-md"
                >
                  <span className="text-sm font-bold text-cc-text">{n.label}</span>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cc-gold px-2 text-xs font-black text-cc-navy">
                    {n.count > 99 ? "99+" : n.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="cc-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-cc-text">오늘 예약 ({reservations.todayCount}건)</h2>
            <Link href="/reservation" className="text-xs font-bold text-cc-navy hover:underline">
              전체보기 →
            </Link>
          </div>
          {reservations.today.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">오늘 등록된 예약이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reservations.today.map((r) => (
                <li key={r.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-cc-text">
                      {r.name} · {r.serviceType}
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.preferredDate} {r.preferredTime} · {r.address}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
            <div className="rounded-lg bg-cc-bg px-2 py-2 text-center">
              <dt className="font-bold text-cc-text">{reservations.statusCounts.waiting_payment}</dt>
              <dd>입금대기</dd>
            </div>
            <div className="rounded-lg bg-cc-bg px-2 py-2 text-center">
              <dt className="font-bold text-cc-text">{reservations.statusCounts.접수}</dt>
              <dd>접수</dd>
            </div>
            <div className="rounded-lg bg-cc-bg px-2 py-2 text-center">
              <dt className="font-bold text-cc-text">{reservations.statusCounts.진행중}</dt>
              <dd>진행중</dd>
            </div>
            <div className="rounded-lg bg-cc-bg px-2 py-2 text-center">
              <dt className="font-bold text-cc-text">{reservations.statusCounts.완료}</dt>
              <dd>완료</dd>
            </div>
          </dl>
          {reservations.unpaidCount > 0 ? (
            <p className="mt-3 rounded-lg bg-cc-gold/10 px-3 py-2 text-xs font-bold text-cc-navy">
              미수금 {reservations.unpaidCount}건 — 정산 현황에서 확인하세요.
            </p>
          ) : null}
        </div>

        <div className="cc-card p-5">
          <h2 className="text-base font-black text-cc-text">파이프라인 · 보고서</h2>
          {!summary.agentSupabaseReady ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              Supabase가 설정되지 않아 사령부 데이터를 표시할 수 없습니다.
            </p>
          ) : (
            <>
              <div className="mt-3 rounded-xl border border-slate-100 px-3 py-2">
                <p className="text-xs font-bold text-slate-500">최근 파이프라인 실행</p>
                {pipeline.latest ? (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm font-bold text-cc-text">{pipeline.latest.pipeline}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                        pipeline.latest.status === "success"
                          ? "bg-cc-green/10 text-cc-green"
                          : pipeline.latest.status === "failed"
                            ? "bg-cc-red/10 text-cc-red"
                            : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {pipeline.latest.status}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">실행 이력이 없습니다.</p>
                )}
                {pipeline.latest ? (
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(pipeline.latest.started_at)}</p>
                ) : null}
                <Link href="/pipeline" className="mt-2 inline-block text-xs font-bold text-cc-navy hover:underline">
                  파이프라인 로그 →
                </Link>
              </div>

              <div className="mt-3 rounded-xl border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-500">최근 경영 보고서</p>
                  {report.latest?.approved ? (
                    <span className="rounded bg-cc-green/10 px-1.5 py-0.5 text-xs font-bold text-cc-green">승인됨</span>
                  ) : null}
                </div>
                {report.latest ? (
                  <>
                    <p className="mt-1 text-sm font-bold text-cc-text">{report.latest.date_label}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{report.latest.chief_summary ?? "(요약 없음)"}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">보고서가 없습니다.</p>
                )}
                <Link href="/report" className="mt-2 inline-block text-xs font-bold text-cc-navy hover:underline">
                  경영 보고서 →
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="pt-2 text-center text-xs text-slate-400">© 2025 대경안심전기</footer>
    </main>
  );
}

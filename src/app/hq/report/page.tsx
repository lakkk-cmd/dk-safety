import HqCommandCenterPanel from "@/components/hq/hq-command-center-panel";
import { isAgentSupabaseReady } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

export default function HqReportPage() {
  const ready = isAgentSupabaseReady();

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          경영 보고서
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">
          회의 주제 · 피드백 · 보고서 아카이브
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          CTO·CSO·CMO·COO·CFO·CLO 6인 경영진이 2라운드 회의 후, 총괄 코디네이터가 종합합니다.
          매주 토요일 08:00 회의 결과가 이곳에 누적됩니다. 콘텐츠로 쓸 보고서를 승인하면 report.dkansim.com 아카이브에 노출됩니다.
        </p>
        <div className="mt-4">
          <a
            href="https://report.dkansim.com"
            className="inline-flex min-h-12 items-center rounded-xl border border-cc-navy/20 bg-white px-4 text-sm font-bold text-cc-navy shadow-sm transition hover:bg-cc-bg"
          >
            보고서 아카이브 →
          </a>
        </div>
      </header>

      {ready ? (
        <HqCommandCenterPanel />
      ) : (
        <section className="cc-card border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <p className="font-bold">Supabase 연결 필요</p>
          <p className="mt-2">
            <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>와{" "}
            <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 설정한 뒤{" "}
            <code className="rounded bg-white px-1">npm run db:apply</code>로 마이그레이션을 적용하세요.
          </p>
        </section>
      )}
    </main>
  );
}

import HqCommandCenterPanel from "@/components/hq/hq-command-center-panel";
import { isAgentSupabaseReady } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

export default function HqPage() {
  const ready = isAgentSupabaseReady();

  return (
    <main className="space-y-6">
      <header className="warranty-band rounded-[2rem] p-6 md:p-8">
        <p className="warranty-badge">AI 경영 사령부</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">
          경영진 사령부
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700">
          CTO·CSO·CMO·COO·CFO·CLO 6인 경영진이 2라운드 회의 후, 총괄 코디네이터가 종합합니다.
          첫 보고는 내일 08:00, 이후 매주 토요일 08:00 회의입니다. 오늘 회의 주제를 저장해 주세요.
        </p>
        <div className="mt-4">
          <a
            href="https://report.dkansim.com"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
          >
            보고서 아카이브 →
          </a>
        </div>
      </header>

      {ready ? (
        <HqCommandCenterPanel />
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
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

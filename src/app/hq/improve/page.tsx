import HqImprovementRequest from "@/components/hq/hq-improvement-request";
import { isAgentSupabaseReady } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

export default function HqImprovePage() {
  const ready = isAgentSupabaseReady();

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          개선 요청
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">⚙️ 자동 개선 파이프라인</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          요청을 제출하면 Claude가 분석해 GitHub Issue를 생성하고, 자동화 워크플로우가 구현·배포까지 진행합니다.
        </p>
      </header>

      {!ready ? (
        <p className="cc-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Supabase가 설정되지 않았습니다. <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 확인하세요.
        </p>
      ) : (
        <HqImprovementRequest />
      )}
    </main>
  );
}

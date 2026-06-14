import HqContentQueue from "@/components/hq/hq-content-queue";
import { isAgentSupabaseReady } from "@/lib/agent-db";

export const dynamic = "force-dynamic";

export default function HqContentPage() {
  const ready = isAgentSupabaseReady();

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          콘텐츠 승인 큐
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">유튜브 · 카카오 · 블로그</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          승인 대기 중인 콘텐츠를 검토하고 승인/거부합니다. 거부 시 입력한 사유는 다음 기획에 반영됩니다. 미리보기
          모달과 실제 발행/업로드는 contents.dkansim.com에서 진행합니다.
        </p>
      </header>

      {!ready ? (
        <p className="cc-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Supabase가 설정되지 않았습니다. <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 확인하세요.
        </p>
      ) : (
        <HqContentQueue />
      )}
    </main>
  );
}

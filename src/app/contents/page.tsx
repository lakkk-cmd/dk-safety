import { isAgentSupabaseReady } from "@/lib/agent-db";
import ContentApprovalPanel from "@/components/contents/content-approval-panel";
import PendingApprovalBadge from "@/components/contents/pending-approval-badge";
import YoutubeChannelAnalysisPanel from "@/components/contents/youtube-channel-analysis-panel";

export const dynamic = "force-dynamic";

export default function ContentsPage() {
  const ready = isAgentSupabaseReady();

  return (
    <main className="space-y-6">
      <header className="warranty-band rounded-[2rem] p-6 md:p-8">
        <p className="warranty-badge">콘텐츠 마케팅 사령부</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">
          유튜브 · 카카오 · 블로그 콘텐츠 파이프라인
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-700">
          유튜브 PD 클립 · 카카오 매니저 톡톡 · 블로그 에디터 펜이 매주 콘텐츠를 기획·작성합니다. 승인하면 실제
          채널로 발행됩니다.
        </p>
        {ready ? <PendingApprovalBadge /> : null}
      </header>

      {!ready ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Supabase가 설정되지 않았습니다. <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
          <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 확인하세요.
        </p>
      ) : (
        <>
          <YoutubeChannelAnalysisPanel />
          <ContentApprovalPanel />
        </>
      )}
    </main>
  );
}

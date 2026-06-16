import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import ContentApprovalPanel from "@/components/contents/content-approval-panel";
import PendingApprovalBadge from "@/components/contents/pending-approval-badge";
import YoutubeChannelAnalysisPanel from "@/components/contents/youtube-channel-analysis-panel";

export const dynamic = "force-dynamic";

type CategoryStat = {
  category: string;
  count: number;
  uploaded: number;
  avgViews: number;
};

const CATEGORY_BADGE: Record<string, string> = {
  전기안전: "bg-cc-green/10 text-cc-green",
  자격시험: "bg-cc-gold/10 text-cc-gold",
  실무: "bg-cc-navy/10 text-cc-navy",
};

async function loadCategoryStats(): Promise<CategoryStat[]> {
  try {
    const supabase = requireAgentSupabase();
    const { data } = await supabase
      .from("content_youtube_queue")
      .select("category, status, view_count")
      .not("category", "is", null);
    if (!data) return [];

    const map = new Map<string, { count: number; uploaded: number; totalViews: number }>();
    for (const row of data) {
      const cat = (row.category as string) ?? "기타";
      const cur = map.get(cat) ?? { count: 0, uploaded: 0, totalViews: 0 };
      cur.count += 1;
      if (row.status === "uploaded") { cur.uploaded += 1; cur.totalViews += (row.view_count as number) ?? 0; }
      map.set(cat, cur);
    }
    return [...map.entries()].map(([category, s]) => ({
      category,
      count: s.count,
      uploaded: s.uploaded,
      avgViews: s.uploaded > 0 ? Math.round(s.totalViews / s.uploaded) : 0,
    }));
  } catch { return []; }
}

export default async function ContentsPage() {
  const ready = isAgentSupabaseReady();
  const categoryStats = ready ? await loadCategoryStats() : [];

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
          {categoryStats.length > 0 && (
            <section className="cc-card p-6">
              <h2 className="text-sm font-black text-cc-text">카테고리별 콘텐츠 현황</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {categoryStats.map((s) => (
                  <div key={s.category} className="rounded-xl border border-slate-100 p-4">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_BADGE[s.category] ?? "bg-slate-100 text-slate-600"}`}>
                      {s.category}
                    </span>
                    <p className="mt-2 text-2xl font-black text-cc-text">{s.count}건</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      업로드 {s.uploaded}건
                      {s.uploaded > 0 && ` · 평균 조회 ${s.avgViews.toLocaleString()}`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
          <YoutubeChannelAnalysisPanel />
          <ContentApprovalPanel />
        </>
      )}
    </main>
  );
}

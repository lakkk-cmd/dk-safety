import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { INTEL_CATEGORIES, type IntelCategory } from "@/lib/market-intelligence";

export const dynamic = "force-dynamic";

type InsightRow = {
  date: string;
  category: IntelCategory;
  trend_keywords: string[];
  insight: string;
  content_ideas: { title: string; brief: string }[];
};

type ChannelAnalysisRow = {
  id: string;
  channel_name: string | null;
  channel_url: string | null;
  pattern_summary: string;
  proposals: { category: IntelCategory; title: string; brief: string }[];
  created_at: string;
};

type QueueRow = {
  id: string;
  title: string;
  category: IntelCategory | null;
  status: string;
  created_at: string;
};

const CATEGORY_COLORS: Record<IntelCategory, { bar: string; badge: string }> = {
  전기안전: { bar: "bg-cc-green", badge: "bg-cc-green/10 text-cc-green" },
  자격시험: { bar: "bg-cc-gold", badge: "bg-cc-gold/10 text-cc-gold" },
  실무: { bar: "bg-cc-navy", badge: "bg-cc-navy/10 text-cc-navy" },
};

const QUEUE_STATUS_LABELS: Record<string, string> = {
  planning: "기획중",
  pending_approval: "승인대기",
  approved: "승인됨",
  producing: "제작중",
  assets_ready: "영상준비완료",
  uploaded: "업로드완료",
  rejected: "반려",
};

export default async function HqIntelligencePage() {
  const ready = isAgentSupabaseReady();

  if (!ready) {
    return (
      <main className="space-y-6">
        <header className="cc-card p-6 md:p-8">
          <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
            마켓 인텔리전스
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">
            시장 정보 · 트렌드 · 채널 분석 대시보드
          </h1>
        </header>
        <section className="cc-card border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <p className="font-bold">Supabase 연결 필요</p>
          <p className="mt-2">
            <code className="rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code>와{" "}
            <code className="rounded bg-white px-1">SUPABASE_SERVICE_ROLE_KEY</code>를 설정한 뒤{" "}
            <code className="rounded bg-white px-1">npm run db:apply</code>로 마이그레이션을 적용하세요.
          </p>
        </section>
      </main>
    );
  }

  const supabase = requireAgentSupabase();
  const [insightsRes, channelRes, queueRes] = await Promise.all([
    supabase
      .from("market_intelligence_insights")
      .select("date, category, trend_keywords, insight, content_ideas")
      .order("date", { ascending: false })
      .limit(30),
    supabase
      .from("youtube_channel_analyses")
      .select("id, channel_name, channel_url, pattern_summary, proposals, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("content_youtube_queue")
      .select("id, title, category, status, created_at")
      .not("category", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const insights = (insightsRes.data ?? []) as InsightRow[];
  const channelAnalyses = (channelRes.data ?? []) as ChannelAnalysisRow[];
  const queueItems = (queueRes.data ?? []) as QueueRow[];

  const keywordFreq: Record<IntelCategory, Map<string, number>> = {
    전기안전: new Map(),
    자격시험: new Map(),
    실무: new Map(),
  };
  const latestByCategory: Partial<Record<IntelCategory, InsightRow>> = {};
  for (const row of insights) {
    const freq = keywordFreq[row.category];
    if (!freq) continue;
    for (const kw of row.trend_keywords ?? []) {
      freq.set(kw, (freq.get(kw) ?? 0) + 1);
    }
    if (!latestByCategory[row.category]) {
      latestByCategory[row.category] = row;
    }
  }

  return (
    <main className="space-y-6">
      <header className="cc-card p-6 md:p-8">
        <p className="inline-flex rounded-full bg-cc-navy px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          마켓 인텔리전스
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-[-0.02em] text-cc-text md:text-3xl">
          시장 정보 · 트렌드 · 채널 분석 대시보드
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          매일 03:00 KST 수집되는 전기안전 · 자격시험 · 실무 카테고리별 트렌드 키워드와 인사이트, 경쟁 채널 분석 결과 및
          추천 콘텐츠 기획안을 한눈에 확인합니다.
        </p>
      </header>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">카테고리별 트렌드 키워드</h2>
        {insights.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">아직 수집된 데이터가 없습니다.</p>
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {INTEL_CATEGORIES.map((category) => {
              const sorted = [...keywordFreq[category].entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
              const maxCount = sorted[0]?.[1] ?? 1;
              return (
                <div key={category}>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_COLORS[category].badge}`}>
                    {category}
                  </span>
                  {sorted.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">데이터 없음</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {sorted.map(([kw, count]) => {
                        const pct = Math.max(8, Math.round((count / maxCount) * 100));
                        return (
                          <div key={kw}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-700">{kw}</span>
                              <span className="text-slate-400">{count}</span>
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${CATEGORY_COLORS[category].bar}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">카테고리별 최근 인사이트</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {INTEL_CATEGORIES.map((category) => {
            const latest = latestByCategory[category];
            return (
              <div key={category} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_COLORS[category].badge}`}>
                    {category}
                  </span>
                  {latest ? <span className="text-xs text-slate-400">{latest.date}</span> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {latest?.insight || "아직 분석 결과가 없습니다."}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">추천 콘텐츠 기획안</h2>
        <p className="mt-1 text-sm text-slate-600">시장 인텔리전스 분석에서 제안된 콘텐츠 아이디어입니다.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {INTEL_CATEGORIES.map((category) => {
            const ideas = latestByCategory[category]?.content_ideas ?? [];
            return (
              <div key={category}>
                <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_COLORS[category].badge}`}>
                  {category}
                </span>
                {ideas.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">제안 없음</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {ideas.map((idea, i) => (
                      <li key={i} className="rounded-lg border border-slate-100 p-3">
                        <p className="text-sm font-bold text-cc-text">{idea.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{idea.brief}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {queueItems.length > 0 ? (
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-cc-text">채널 분석 기반 영상 아이디어 큐</h3>
            <ul className="mt-2 space-y-2">
              {queueItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {item.category ? (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_COLORS[item.category].badge}`}>
                        {item.category}
                      </span>
                    ) : null}
                    <span className="text-cc-text">{item.title}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-500">
                    {QUEUE_STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="cc-card p-6">
        <h2 className="text-base font-black text-cc-text">경쟁 채널 분석 결과</h2>
        {channelAnalyses.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">아직 분석된 채널이 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {channelAnalyses.map((ca) => (
              <li key={ca.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  {ca.channel_url ? (
                    <a
                      href={ca.channel_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-cc-navy hover:underline"
                    >
                      {ca.channel_name ?? "이름 없음"}
                    </a>
                  ) : (
                    <span className="text-sm font-bold text-cc-text">{ca.channel_name ?? "이름 없음"}</span>
                  )}
                  <span className="text-xs text-slate-400">{new Date(ca.created_at).toLocaleDateString("ko-KR")}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{ca.pattern_summary}</p>
                {ca.proposals?.length > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {INTEL_CATEGORIES.map((category) => {
                      const items = ca.proposals.filter((p) => p.category === category);
                      if (items.length === 0) return null;
                      return (
                        <div key={category}>
                          <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-bold ${CATEGORY_COLORS[category].badge}`}>
                            {category}
                          </span>
                          <ul className="mt-1 space-y-1">
                            {items.map((p, i) => (
                              <li key={i} className="text-xs text-slate-600">
                                · {p.title}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

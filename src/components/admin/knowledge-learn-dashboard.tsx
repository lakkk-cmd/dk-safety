"use client";

import { useCallback, useEffect, useState } from "react";

type CategoryRow = {
  category: string;
  type: string;
  chunks: number;
  lastLearned: string;
};

type RecentRow = {
  sourceFile: string;
  chunks: number;
  type: string;
  label: string;
  category: string;
  lastLearned: string;
};

type Stats = {
  total: number;
  pdf: number;
  tavily: number;
  firecrawl: number;
  categories: CategoryRow[];
  recent: RecentRow[];
};

function typeBadge(type: string) {
  if (type === "tavily") return { text: "웹서치", cls: "bg-blue-100 text-blue-800" };
  if (type === "firecrawl") return { text: "크롤링", cls: "bg-purple-100 text-purple-800" };
  return { text: "PDF", cls: "bg-amber-100 text-amber-800" };
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

function StatCard({ icon, label, value, colorClass }: { icon: string; label: string; value: number; colorClass: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${colorClass}`}>
      <p className="text-2xl">{icon}</p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-600">{label}</p>
    </div>
  );
}

const LEARN_CATEGORIES = ['전기법령', '전기기술', '유튜브', '마케팅', 'AI자동화', '사업경영', '일반'];

export default function KnowledgeLearnDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/knowledge/web-learn", { cache: "no-store" });
      const data = (await res.json()) as Stats & { error?: string };
      if (res.ok) {
        setStats(data);
        setFetchError(null);
      } else {
        setFetchError(data.error ?? "통계 로드 실패");
      }
    } catch {
      setFetchError("통계 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  const runWebLearn = async () => {
    setRunning(true);
    setRunResult(null);
    setCurrentCategory(null);

    let totalTavilySuccess = 0, totalTavilyChunks = 0;
    let totalFirecrawlSuccess = 0, totalFirecrawlChunks = 0;
    let anyError: string | null = null;

    for (const cat of LEARN_CATEGORIES) {
      setCurrentCategory(cat);
      try {
        const res = await fetch("/api/admin/knowledge/web-learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "both", category: cat }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          error?: string;
          results?: {
            tavily?: { success: number; failed: number; totalChunks: number };
            firecrawl?: { success: number; failed: number; totalChunks: number };
          };
        };
        if (res.ok && data.success) {
          totalTavilySuccess += data.results?.tavily?.success ?? 0;
          totalTavilyChunks += data.results?.tavily?.totalChunks ?? 0;
          totalFirecrawlSuccess += data.results?.firecrawl?.success ?? 0;
          totalFirecrawlChunks += data.results?.firecrawl?.totalChunks ?? 0;
        } else {
          anyError = `${cat}: ${data.error ?? "오류"}`;
        }
      } catch (e) {
        anyError = `${cat}: ${e instanceof Error ? e.message : "알 수 없는 오류"}`;
      }
    }

    setCurrentCategory(null);
    setRunning(false);
    setRunResult({
      ok: anyError === null,
      msg: anyError
        ? `일부 실패 — ${anyError} / Tavily ${totalTavilySuccess}건 / ${totalTavilyChunks}청크`
        : `완료 — Tavily ${totalTavilySuccess}건 / ${totalTavilyChunks}청크, Firecrawl ${totalFirecrawlSuccess}건 / ${totalFirecrawlChunks}청크`,
    });
    void fetchStats();
  };

  return (
    <div className="space-y-5">
      {/* 헤더 + 실행 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">학습 현황 대시보드</h2>
          <p className="mt-0.5 text-xs text-slate-500">PDF 학습 + 웹서치 자동학습 현황을 종합 표시합니다</p>
        </div>
        <button
          type="button"
          onClick={() => void runWebLearn()}
          disabled={running}
          className={`min-h-11 rounded-xl px-5 text-sm font-bold transition ${
            running
              ? "cursor-not-allowed bg-slate-200 text-slate-400"
              : "bg-dk-blue text-white shadow-[0_4px_12px_rgba(26,92,255,0.25)] hover:bg-blue-700"
          }`}
        >
          {running ? `⏳ ${currentCategory ?? "준비 중"}… (${LEARN_CATEGORIES.indexOf(currentCategory ?? '') + 1}/${LEARN_CATEGORIES.length})` : "🌐 지금 웹서치 학습 실행"}
        </button>
      </div>

      {/* 실행 결과 배너 */}
      {runResult && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            runResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {runResult.ok ? "✅ " : "❌ "}{runResult.msg}
        </div>
      )}

      {/* 요약 카드 4개 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon="🧠" label="전체 청크 수" value={stats.total} colorClass="border-slate-200 bg-slate-50" />
          <StatCard icon="📄" label="PDF 학습" value={stats.pdf} colorClass="border-amber-200 bg-amber-50" />
          <StatCard icon="🔍" label="웹서치 학습" value={stats.tavily} colorClass="border-blue-200 bg-blue-50" />
          <StatCard icon="🌐" label="크롤링 학습" value={stats.firecrawl} colorClass="border-purple-200 bg-purple-50" />
        </div>
      ) : null}

      {fetchError && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{fetchError}</p>
      )}

      {/* 카테고리별 분포 테이블 */}
      {stats && stats.categories.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700">카테고리별 청크 분포</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {stats.categories.map((cat, i) => {
              const badge = typeBadge(cat.type);
              return (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.text}</span>
                    <span className="text-sm font-semibold text-slate-800">{cat.category}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-slate-900">{cat.chunks.toLocaleString()}개</span>
                    <span className="hidden w-32 text-right text-xs text-slate-400 sm:block">{fmt(cat.lastLearned)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 최근 학습 이력 10개 */}
      {stats && stats.recent.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700">최근 학습 이력 (최신 10개)</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {stats.recent.map((item, i) => {
              const badge = typeBadge(item.type);
              return (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.text}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-400">{item.category}</p>
                    </div>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <p className="text-xs font-bold text-slate-700">{item.chunks}청크</p>
                    <p className="text-xs text-slate-400">{fmt(item.lastLearned)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 데이터 없음 */}
      {!loading && stats && stats.total === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-12 text-slate-400">
          <p className="text-3xl">📭</p>
          <p className="mt-2 text-sm font-medium">학습된 청크가 없습니다</p>
          <p className="mt-1 text-xs">PDF 업로드 또는 웹서치 학습을 실행해주세요</p>
        </div>
      )}
    </div>
  );
}

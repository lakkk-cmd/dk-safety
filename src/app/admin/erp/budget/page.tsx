"use client";

import { useEffect, useState, useCallback } from "react";

const CATEGORIES = ["재료비", "공구/장비", "교통비", "통신비", "광고비", "인건비", "기타"] as const;

type ProgressRow = { category: string; planned: number; actual: number };

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetPage() {
  const [month, setMonth] = useState(thisMonth());
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/erp/budget?month=${m}`, { cache: "no-store" });
      const json = (await res.json()) as { progress?: ProgressRow[] };
      const rows = json.progress ?? [];
      setProgress(rows);
      setInputs(Object.fromEntries(rows.map((r) => [r.category, String(r.planned || "")])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(month); }, [load, month]);

  const progressByCategory = new Map(progress.map((p) => [p.category, p]));

  const save = async (category: string) => {
    const plannedAmount = Number(inputs[category] ?? 0);
    if (!Number.isFinite(plannedAmount) || plannedAmount < 0) return;
    setSavingCategory(category);
    try {
      await fetch("/api/admin/erp/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, category, planned_amount: plannedAmount })
      });
      void load(month);
    } finally {
      setSavingCategory(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">예산관리</h1>
        <p className="mt-1 text-sm text-slate-600">카테고리별 이번 달 예산을 입력하면 실제 지출 대비 진행률을 볼 수 있습니다.</p>
      </div>

      <div className="mb-6">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {loading ? (
        <p className="py-8 text-center text-slate-400">불러오는 중...</p>
      ) : (
        <div className="space-y-3">
          {CATEGORIES.map((category) => {
            const row = progressByCategory.get(category);
            const planned = row?.planned ?? 0;
            const actual = row?.actual ?? 0;
            const pct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
            const over = planned > 0 && actual > planned;
            return (
              <div key={category} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-slate-900">{category}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={inputs[category] ?? ""}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [category]: e.target.value }))}
                      placeholder="예산(원)"
                      className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void save(category)}
                      disabled={savingCategory === category}
                      className="rounded-md bg-slate-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                    >
                      저장
                    </button>
                  </div>
                </div>
                {planned > 0 ? (
                  <>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className={`mt-1 text-xs ${over ? "font-bold text-red-600" : "text-slate-500"}`}>
                      {formatKRW(actual)} / {formatKRW(planned)} ({pct}%){over && " — 예산 초과"}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">실제 지출: {formatKRW(actual)} (예산 미설정)</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

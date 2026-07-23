"use client";

import { useEffect, useState, useCallback } from "react";
import type { IncomeStatement } from "@/lib/financial-ledger";

function formatKRW(n: number) {
  return `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("ko-KR")}원`;
}

function thisMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export default function IncomeStatementPage() {
  const defaults = thisMonthRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [stmt, setStmt] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/erp/income-statement?from=${f}&to=${t}`, { cache: "no-store" });
      const json = (await res.json()) as IncomeStatement & { error?: string };
      if (!json.error) setStmt(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(from, to); }, [load, from, to]);

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">손익계산서</h1>
        <p className="mt-1 text-sm text-slate-600">매출액에서 매출원가·판매관리비를 순서대로 뺀 기간별 손익입니다.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <span className="text-slate-400">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {loading || !stmt ? (
        <p className="py-8 text-center text-slate-400">불러오는 중...</p>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-5 py-3 font-bold text-slate-900">매출액</td>
                  <td className="px-5 py-3 text-right font-bold text-blue-600">{formatKRW(stmt.revenue)}</td>
                </tr>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <td className="px-5 py-3 pl-8 text-slate-600">매출원가 (재료비+인건비)</td>
                  <td className="px-5 py-3 text-right text-red-500">-{formatKRW(stmt.costOfSales)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-5 py-3 font-bold text-slate-900">매출총이익</td>
                  <td className="px-5 py-3 text-right font-bold text-slate-900">{formatKRW(stmt.grossProfit)}</td>
                </tr>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <td className="px-5 py-3 pl-8 text-slate-600">판매관리비 (교통비·통신비·광고비·공구장비·기타)</td>
                  <td className="px-5 py-3 text-right text-red-500">-{formatKRW(stmt.sgaExpenses)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-4 text-lg font-black text-slate-900">영업이익</td>
                  <td className={`px-5 py-4 text-right text-lg font-black ${stmt.operatingProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatKRW(stmt.operatingProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">항목별 내역</h2>
            <div className="space-y-2">
              {stmt.byCategory.map((c) => (
                <div key={c.category} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{c.category}</span>
                  <span className={`font-semibold ${c.total >= 0 ? "text-blue-600" : "text-red-600"}`}>{formatKRW(c.total)}</span>
                </div>
              ))}
              {stmt.byCategory.length === 0 ? <p className="text-sm text-slate-400">해당 기간에 거래내역이 없습니다.</p> : null}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

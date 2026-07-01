"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardStats, Invoice } from "@/lib/erp-db";

function formatKRW(n: number) {
  if (Math.abs(n) >= 100_000_000) return (n / 100_000_000).toFixed(1) + "억원";
  if (Math.abs(n) >= 10_000) return (n / 10_000).toFixed(0) + "만원";
  return n.toLocaleString("ko-KR") + "원";
}

function formatKRWFull(n: number) { return n.toLocaleString("ko-KR") + "원"; }

const STATUS_LABEL: Record<string, string> = { draft: "초안", sent: "발송" };
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-100 text-blue-700",
};

export default function ErpDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/erp/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: DashboardStats & { error?: string }) => {
        if (d.error) setError(d.error);
        else setStats(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <main className="flex h-64 items-center justify-center"><p className="text-slate-500">불러오는 중...</p></main>;
  if (error || !stats) return <main className="p-8"><p className="text-red-600">오류: {error}</p></main>;

  const maxMonthly = Math.max(...stats.monthly.map((m) => Math.max(m.revenue, m.expenses)), 1);

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">경영 대시보드</h1>
        <p className="mt-1 text-sm text-slate-600">최근 6개월 수익/지출 현황</p>
      </div>

      {/* 요약 카드 4개 */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "총 매출", value: stats.revenue, color: "text-blue-600", bg: "bg-blue-50", icon: "💰" },
          { label: "총 지출", value: stats.expenses, color: "text-red-600", bg: "bg-red-50", icon: "📤" },
          { label: "순이익", value: stats.profit, color: stats.profit >= 0 ? "text-green-600" : "text-red-600", bg: stats.profit >= 0 ? "bg-green-50" : "bg-red-50", icon: "📈" },
          { label: "작업 건수", value: stats.jobCount, color: "text-slate-700", bg: "bg-slate-50", icon: "🔧", unit: "건" },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border border-slate-200 ${card.bg} p-5 shadow-sm`}>
            <p className="text-2xl">{card.icon}</p>
            <p className="mt-2 text-xs font-semibold text-slate-500">{card.label}</p>
            <p className={`mt-1 text-xl font-black ${card.color}`}>
              {card.unit ? `${stats.jobCount}건` : formatKRW(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* 6개월 추세 차트 */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-900">📊 월별 매출/지출 추세</h2>
        <div className="flex items-end gap-4">
          {stats.monthly.map((m) => (
            <div key={m.month} className="flex-1 min-w-0">
              <div className="flex gap-1 items-end" style={{ height: 120 }}>
                <div className="flex-1 rounded-t-md bg-blue-400 transition-all"
                  style={{ height: `${Math.round((m.revenue / maxMonthly) * 100)}%`, minHeight: m.revenue > 0 ? 4 : 0 }}
                  title={`매출: ${formatKRWFull(m.revenue)}`} />
                <div className="flex-1 rounded-t-md bg-red-300 transition-all"
                  style={{ height: `${Math.round((m.expenses / maxMonthly) * 100)}%`, minHeight: m.expenses > 0 ? 4 : 0 }}
                  title={`지출: ${formatKRWFull(m.expenses)}`} />
              </div>
              <p className="mt-1 text-center text-xs text-slate-500 truncate">{m.month.slice(5)}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-blue-400" />매출</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-300" />지출</span>
        </div>
      </div>

      {/* 미수금 목록 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">
            ⚠️ 미수금 목록
            {stats.unpaidInvoices.length > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                {stats.unpaidInvoices.length}건
              </span>
            )}
          </h2>
        </div>
        {stats.unpaidInvoices.length === 0 ? (
          <p className="py-8 text-center text-slate-400">미수금이 없습니다 ✅</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">번호</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">고객</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">상태</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">금액</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">납부기한</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {stats.unpaidInvoices.map((inv: Invoice) => {
                  const overdue = inv.due_at && new Date(inv.due_at) < new Date();
                  return (
                    <tr key={inv.id} className={`border-t border-slate-100 ${overdue ? "bg-red-50/50" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{inv.invoice_number}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{inv.customer_name}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[inv.status]}`}>
                          {STATUS_LABEL[inv.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatKRWFull(inv.total)}</td>
                      <td className="px-4 py-3 text-xs">
                        {inv.due_at ? (
                          <span className={overdue ? "font-bold text-red-600" : "text-slate-600"}>
                            {new Date(inv.due_at).toLocaleDateString("ko-KR")}
                            {overdue && " ⚠️"}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Link href="/admin/erp/invoices" className="text-xs font-bold text-blue-600 hover:underline">관리 →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

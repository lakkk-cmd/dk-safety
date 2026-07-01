"use client";

import { useEffect, useState, useCallback } from "react";
import type { Expense, CategoryStat } from "@/lib/erp-db";

const CATEGORIES = ["재료비", "공구/장비", "교통비", "통신비", "광고비", "기타"] as const;
const PAY_METHODS = ["카드", "현금", "계좌이체"] as const;

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function ErpExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stats, setStats] = useState<{ monthly: { month: string; total: number }[]; byCategory: CategoryStat[] } | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [loading, setLoading] = useState(true);

  // form
  const [category, setCategory] = useState<typeof CATEGORIES[number]>(CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<typeof PAY_METHODS[number]>("카드");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const [expRes, statRes] = await Promise.all([
        fetch(`/api/admin/erp/expenses?month=${m}`, { cache: "no-store" }),
        fetch("/api/admin/erp/expenses?stats=1", { cache: "no-store" }),
      ]);
      const expJson = await expRes.json() as { expenses: Expense[] };
      const statJson = await statRes.json() as { monthly: { month: string; total: number }[]; byCategory: CategoryStat[] };
      setExpenses(expJson.expenses ?? []);
      setStats(statJson);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(month); }, [load, month]);

  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const maxCat = stats?.byCategory.reduce((m, c) => Math.max(m, c.total), 1) ?? 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch("/api/admin/erp/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, subcategory: subcategory || null, amount: Number(amount), description: description || null, expense_date: expenseDate, payment_method: payMethod }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAmount(""); setSubcategory(""); setDescription("");
      setSubmitMsg("✅ 경비가 등록되었습니다.");
      void load(month);
    } catch (err) {
      setSubmitMsg("오류: " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">경비 관리</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 입력 폼 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">📥 경비 입력</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">분류 *</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">세부 항목</label>
              <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)}
                placeholder="예: 전선, 스위치"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">금액 (원) *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required min="1"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">지출일 *</label>
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">결제수단</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof PAY_METHODS[number])}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">설명</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {submitMsg && <p className={`text-xs font-semibold ${submitMsg.startsWith("오류") ? "text-red-600" : "text-green-600"}`}>{submitMsg}</p>}
            <button type="submit" disabled={submitting}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {submitting ? "등록 중..." : "경비 등록"}
            </button>
          </form>
        </div>

        {/* 카테고리 비율 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">📊 분류별 비율 (6개월)</h2>
          {!stats ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : stats.byCategory.length === 0 ? (
            <p className="text-sm text-slate-400">데이터 없음</p>
          ) : (
            <div className="space-y-3">
              {stats.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
                    <span>{c.category}</span>
                    <span>{formatKRW(c.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round((c.total / maxCat) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 월별 합계 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-900">📅 월별 합계 (6개월)</h2>
          {!stats ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : stats.monthly.length === 0 ? (
            <p className="text-sm text-slate-400">데이터 없음</p>
          ) : (
            <div className="space-y-2">
              {[...stats.monthly].reverse().map((m) => (
                <div key={m.month} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-600">{m.month}</span>
                  <span className="text-sm font-bold text-slate-900">{formatKRW(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 경비 목록 */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">
            {month} 경비 목록 — 합계 <span className="text-blue-600">{formatKRW(monthTotal)}</span>
          </h2>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">불러오는 중...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">날짜</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">분류</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">내용</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">결제</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400">이 달 경비가 없습니다.</td></tr>
                ) : expenses.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{e.expense_date}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{e.category}</span>
                      {e.subcategory && <span className="ml-1 text-xs text-slate-500">{e.subcategory}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.description ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-500">{e.payment_method}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatKRW(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { SALES_PLAN_EXPENSE_TAG } from "@/lib/sales-plan-constants";

type VisitEntry = {
  id: string;
  apartmentName: string;
  visitDate: string;
  outcome: "가입완료" | "검토중" | "거절";
  memo: string | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string;
};

const inputClass =
  "min-h-14 w-full rounded-2xl border border-slate-200 px-4 text-[15px] text-cc-text placeholder:text-slate-400 focus:border-cc-navy focus:outline-none";

export default function SalesVisitLogPage() {
  const [entries, setEntries] = useState<VisitEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [apartmentName, setApartmentName] = useState("");
  const [outcome, setOutcome] = useState<VisitEntry["outcome"]>("검토중");
  const [memo, setMemo] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [visitSubmitting, setVisitSubmitting] = useState(false);
  const [visitMessage, setVisitMessage] = useState<string | null>(null);

  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<"교통비" | "광고비" | "기타">("교통비");
  const [expenseMemo, setExpenseMemo] = useState("");
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseMessage, setExpenseMessage] = useState<string | null>(null);

  async function loadEntries() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sales-visit-log");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  async function submitVisit(e: React.FormEvent) {
    e.preventDefault();
    if (!apartmentName.trim()) return;
    setVisitSubmitting(true);
    setVisitMessage(null);
    try {
      const res = await fetch("/api/admin/sales-visit-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentName: apartmentName.trim(),
          outcome,
          memo: memo.trim() || null,
          contactName: contactName.trim() || null,
          contactPhone: contactPhone.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setVisitMessage(`저장 실패: ${err.error ?? "알 수 없는 오류"}`);
        return;
      }
      setApartmentName("");
      setOutcome("검토중");
      setMemo("");
      setContactName("");
      setContactPhone("");
      setVisitMessage("기록했습니다.");
      loadEntries();
    } finally {
      setVisitSubmitting(false);
    }
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0) return;
    setExpenseSubmitting(true);
    setExpenseMessage(null);
    try {
      // 사람이 태그를 직접 타이핑하지 않는다 — 코드가 자동으로 붙인다.
      const description = `${SALES_PLAN_EXPENSE_TAG}${expenseMemo.trim()}`.trim();
      const res = await fetch("/api/admin/erp/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: expenseCategory,
          amount,
          description,
          expense_date: new Date().toISOString().slice(0, 10),
          payment_method: "카드",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setExpenseMessage(`등록 실패: ${err.error ?? "알 수 없는 오류"}`);
        return;
      }
      setExpenseAmount("");
      setExpenseMemo("");
      setExpenseMessage("영업비를 등록했습니다.");
    } finally {
      setExpenseSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-bold text-cc-navy">9-11월 영업계획 · 방문기록</h1>

      <form onSubmit={submitVisit} className="cc-card space-y-3 p-4">
        <h2 className="text-sm font-bold text-cc-text">방문 기록</h2>
        <input
          className={inputClass}
          placeholder="단지명"
          value={apartmentName}
          onChange={(e) => setApartmentName(e.target.value)}
          required
        />
        <select
          className={inputClass}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as VisitEntry["outcome"])}
        >
          <option value="가입완료">가입완료</option>
          <option value="검토중">검토중</option>
          <option value="거절">거절</option>
        </select>
        <textarea
          className="min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-[15px] text-cc-text placeholder:text-slate-400 focus:border-cc-navy focus:outline-none"
          placeholder="메모"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="담당자명(선택)"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="담당자 연락처(선택)"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
        <button
          type="submit"
          disabled={visitSubmitting}
          className="min-h-14 w-full rounded-2xl bg-cc-navy text-[15px] font-bold text-white disabled:opacity-50"
        >
          {visitSubmitting ? "저장 중..." : "방문 기록 저장"}
        </button>
        {visitMessage ? <p className="text-sm text-slate-500">{visitMessage}</p> : null}
      </form>

      <form onSubmit={submitExpense} className="cc-card space-y-3 p-4">
        <h2 className="text-sm font-bold text-cc-text">영업비 등록</h2>
        <input
          className={inputClass}
          type="number"
          placeholder="금액"
          value={expenseAmount}
          onChange={(e) => setExpenseAmount(e.target.value)}
          required
        />
        <select
          className={inputClass}
          value={expenseCategory}
          onChange={(e) => setExpenseCategory(e.target.value as typeof expenseCategory)}
        >
          <option value="교통비">교통비</option>
          <option value="광고비">광고비</option>
          <option value="기타">기타</option>
        </select>
        <input
          className={inputClass}
          placeholder="메모(예: OO아파트 관리사무소 방문)"
          value={expenseMemo}
          onChange={(e) => setExpenseMemo(e.target.value)}
        />
        <button
          type="submit"
          disabled={expenseSubmitting}
          className="min-h-14 w-full rounded-2xl border-2 border-cc-navy text-[15px] font-bold text-cc-navy disabled:opacity-50"
        >
          {expenseSubmitting ? "등록 중..." : "영업비 등록"}
        </button>
        {expenseMessage ? <p className="text-sm text-slate-500">{expenseMessage}</p> : null}
      </form>

      <div className="cc-card p-4">
        <h2 className="mb-2 text-sm font-bold text-cc-text">최근 방문기록</h2>
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400">아직 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cc-text">{entry.apartmentName}</span>
                  <span className="text-slate-400">{entry.visitDate}</span>
                </div>
                <div className="mt-1 text-slate-500">
                  {entry.outcome}
                  {entry.memo ? ` · ${entry.memo}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

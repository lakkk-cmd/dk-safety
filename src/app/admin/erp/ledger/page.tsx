"use client";

import { useEffect, useState, useCallback } from "react";
import type { LedgerEntry } from "@/lib/financial-ledger";

function formatKRW(n: number) {
  return `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("ko-KR")}원`;
}

function thisMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

const SOURCE_LABEL: Record<string, string> = {
  order_payment: "예약금 결제",
  order_final_settlement: "현장 정산 잔금",
  expense: "경비",
  refund: "환불",
  manual: "수기 입력"
};

export default function ErpLedgerPage() {
  const defaults = thisMonthRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("기타");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/erp/ledger?from=${f}&to=${t}`, { cache: "no-store" });
      const json = (await res.json()) as { entries?: LedgerEntry[] };
      setEntries(json.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(from, to); }, [load, from, to]);

  const revenue = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const expenseTotal = entries.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt) {
      setMsg("금액을 입력하세요.");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/erp/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_date: entryDate, category, amount: amt, description: description || null })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? "저장 실패");
        return;
      }
      setAmount("");
      setDescription("");
      setMsg("전표가 등록되었습니다.");
      void load(from, to);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (e: LedgerEntry) => {
    setEditingId(e.id);
    setEditDate(e.entry_date);
    setEditCategory(e.category);
    setEditAmount(String(e.amount));
    setEditDescription(e.description ?? "");
    setMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    const amt = Number(editAmount);
    if (!amt) {
      setMsg("금액을 입력하세요.");
      return;
    }
    setRowBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/erp/ledger/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_date: editDate, category: editCategory, amount: amt, description: editDescription || null })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? "수정 실패");
        return;
      }
      setEditingId(null);
      setMsg("항목이 수정되었습니다.");
      void load(from, to);
    } finally {
      setRowBusyId(null);
    }
  };

  const removeEntry = async (e: LedgerEntry) => {
    const warning =
      e.source_type === "manual"
        ? "이 수기 항목을 삭제할까요?"
        : `이 항목은 ${SOURCE_LABEL[e.source_type] ?? e.source_type} 화면에서 자동 기장된 것입니다. 원장에서만 지워지고 원본 데이터는 그대로 남습니다 — 삭제할까요?`;
    if (!window.confirm(warning)) return;
    setRowBusyId(e.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/erp/ledger/${e.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? "삭제 실패");
        return;
      }
      setMsg("항목이 삭제되었습니다.");
      void load(from, to);
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">총계정원장</h1>
        <p className="mt-1 text-sm text-slate-600">모든 매출·경비·환불이 자동으로 쌓이는 원장입니다. 필요하면 수기 전표도 추가할 수 있습니다.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <span className="text-slate-400">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-blue-50 p-5">
          <p className="text-xs font-semibold text-slate-500">매출</p>
          <p className="mt-1 text-xl font-black text-blue-600">{formatKRW(revenue)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-red-50 p-5">
          <p className="text-xs font-semibold text-slate-500">지출</p>
          <p className="mt-1 text-xl font-black text-red-600">{formatKRW(expenseTotal)}</p>
        </div>
        <div className={`rounded-2xl border border-slate-200 p-5 ${revenue - expenseTotal >= 0 ? "bg-green-50" : "bg-red-50"}`}>
          <p className="text-xs font-semibold text-slate-500">순이익</p>
          <p className={`mt-1 text-xl font-black ${revenue - expenseTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatKRW(revenue - expenseTotal)}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-900">수기 전표 입력</h2>
        <p className="mb-3 text-xs text-slate-500">
          결제·경비 화면을 거치지 않은 거래(예: 통장에서 바로 확인된 입금)만 여기서 직접 등록하세요. 예약금·정산·경비는
          해당 화면에서 처리하면 자동으로 원장에 반영됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="항목명 (예: 매출, 재료비)" className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="금액 (수입은 +, 지출은 -)"
            className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="메모" className="min-w-[160px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </div>
        {msg ? <p className="mt-2 text-xs text-slate-600">{msg}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">거래내역</h2>
          <p className="mt-1 text-xs text-slate-500">
            자동 기장된 항목(예약금 결제·현장 정산 잔금·경비 등)도 여기서 직접 수정·삭제할 수 있습니다. 단, 원장에서만
            지워질 뿐 예약/주문/경비 원본 데이터는 바뀌지 않습니다 — 원본이 나중에 다시 갱신되면 새 항목이 또 쌓일 수 있습니다.
          </p>
        </div>
        {loading ? (
          <p className="py-8 text-center text-slate-400">불러오는 중...</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-slate-400">해당 기간에 거래내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">날짜</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">항목</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">출처</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">메모</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">금액</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) =>
                  editingId === e.id ? (
                    <tr key={e.id} className="border-t border-slate-100 bg-amber-50/60">
                      <td className="px-2 py-2">
                        <input type="date" value={editDate} onChange={(ev) => setEditDate(ev.target.value)} className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-2 py-2">
                        <input value={editCategory} onChange={(ev) => setEditCategory(ev.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{SOURCE_LABEL[e.source_type] ?? e.source_type}</td>
                      <td className="px-2 py-2">
                        <input value={editDescription} onChange={(ev) => setEditDescription(ev.target.value)} className="w-full min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(ev) => setEditAmount(ev.target.value)}
                          className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void saveEdit(e.id)}
                            disabled={rowBusyId === e.id}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                          >
                            저장
                          </button>
                          <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">
                            취소
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-600">{e.entry_date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{e.category}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{SOURCE_LABEL[e.source_type] ?? e.source_type}</td>
                      <td className="px-4 py-3 text-slate-700">{e.description ?? "-"}</td>
                      <td className={`px-4 py-3 text-right font-bold ${e.amount >= 0 ? "text-blue-600" : "text-red-600"}`}>
                        {formatKRW(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            disabled={rowBusyId === e.id}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeEntry(e)}
                            disabled={rowBusyId === e.id}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

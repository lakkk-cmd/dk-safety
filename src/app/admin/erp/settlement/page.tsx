"use client";

import { useEffect, useState, useCallback } from "react";
import type { PendingSettlement, SettlementHistoryItem } from "@/lib/erp-db";

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function ErpSettlementPage() {
  const [pending, setPending] = useState<PendingSettlement[]>([]);
  const [history, setHistory] = useState<SettlementHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/erp/settlement", { cache: "no-store" });
      const json = (await res.json()) as { pending?: PendingSettlement[]; history?: SettlementHistoryItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      setPending(json.pending ?? []);
      setHistory(json.history ?? []);
      setAmounts((prev) => {
        const next = { ...prev };
        for (const p of json.pending ?? []) {
          if (next[p.reservationId] === undefined) next[p.reservationId] = String(p.suggestedAmount || "");
        }
        return next;
      });
    } catch (e) {
      setMessage("오류: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSettle = async (item: PendingSettlement) => {
    const amount = Number(amounts[item.reservationId]);
    if (!amount || amount <= 0) {
      setMessage("지급액을 입력하세요.");
      return;
    }
    setSubmittingId(item.reservationId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/erp/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: item.reservationId,
          workerId: item.workerId,
          payAmount: amount,
          expenseDate: item.completedDate,
          workerName: item.workerName,
          serviceType: item.serviceType,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "정산 실패");
      setMessage(`✅ ${item.workerName}님 ${formatKRW(amount)} 정산 완료 — 경비관리(인건비)에 자동 반영됩니다.`);
      await load();
    } catch (e) {
      setMessage("오류: " + (e as Error).message);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">기사 수당 정산</h1>
        <p className="mt-1 text-sm text-slate-600">
          완료된 작업에 배정된 기사에게 지급할 금액을 확정합니다. 확정하면 경비관리에 &quot;인건비&quot;로 자동 기록되어
          경영대시보드 지출/순이익에 즉시 반영됩니다.
        </p>
      </div>

      {message && (
        <p className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${message.startsWith("오류") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>
          {message}
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">
            정산 대기
            {pending.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{pending.length}건</span>
            )}
          </h2>
        </div>
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">불러오는 중...</p>
        ) : pending.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">정산 대기 중인 작업이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((item) => (
              <li key={item.reservationId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.workerName} <span className="font-normal text-slate-500">· {item.serviceType}</span>
                  </p>
                  <p className="text-xs text-slate-500">{item.address} · {item.completedDate}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={amounts[item.reservationId] ?? ""}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [item.reservationId]: e.target.value }))}
                    className="w-32 rounded-xl border border-slate-300 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="지급액"
                  />
                  <button
                    type="button"
                    disabled={submittingId === item.reservationId}
                    onClick={() => void handleSettle(item)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submittingId === item.reservationId ? "처리 중..." : "정산 확정"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">정산 이력</h2>
        </div>
        {history.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">정산 이력이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">기사</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-right">지급액</th>
                <th className="px-4 py-3 font-semibold text-slate-600">정산일</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900">{h.workerName}</td>
                  <td className="px-4 py-3 text-right text-slate-900">{h.payAmount ? formatKRW(h.payAmount) : "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{h.completedAt ? new Date(h.completedAt).toLocaleDateString("ko-KR") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

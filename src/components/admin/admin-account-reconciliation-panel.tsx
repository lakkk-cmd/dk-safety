"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountBalanceCheckpoint, AccountLedgerEntry, LedgerDirection, ReconciliationResult } from "@/lib/account-ledger";

const LEDGER_CATEGORIES = ["은행수수료", "이자", "현금매출", "현금지출", "기타"];

function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** toLocaleString의 오전/오후 표기가 서버·클라이언트에서 다르게 렌더링돼 하이드레이션이
 *  깨지는 걸 피하려고 KST로 직접 환산한 고정 포맷을 쓴다(admin-finance-panel.tsx와 동일 원칙). */
function formatKstDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function todayDateString(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function AdminAccountReconciliationPanel() {
  const [checkpoints, setCheckpoints] = useState<AccountBalanceCheckpoint[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [entries, setEntries] = useState<AccountLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [balanceInput, setBalanceInput] = useState("");
  const [balanceMemo, setBalanceMemo] = useState("");

  const [entryDate, setEntryDate] = useState(todayDateString());
  const [entryDirection, setEntryDirection] = useState<LedgerDirection>("OUT");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryCategory, setEntryCategory] = useState(LEDGER_CATEGORIES[0]);
  const [entryMemo, setEntryMemo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [checkpointRes, entryRes] = await Promise.all([
        fetch("/api/admin/account-balance-checkpoints", { cache: "no-store" }),
        fetch("/api/admin/account-ledger", { cache: "no-store" })
      ]);
      const checkpointData = (await checkpointRes.json()) as {
        checkpoints?: AccountBalanceCheckpoint[];
        reconciliation?: ReconciliationResult;
        message?: string;
      };
      const entryData = (await entryRes.json()) as { entries?: AccountLedgerEntry[]; message?: string };
      if (checkpointRes.ok) {
        setCheckpoints(checkpointData.checkpoints ?? []);
        setReconciliation(checkpointData.reconciliation ?? null);
      }
      if (entryRes.ok) {
        setEntries(entryData.entries ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestCheckpoint = checkpoints[0] ?? null;

  const submitCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const balance = Number(balanceInput);
    if (!Number.isFinite(balance) || balance < 0) {
      setMessage("실제 잔액을 올바르게 입력해주세요.");
      return;
    }
    const expected = reconciliation?.expectedBalance ?? 0;
    const diff = balance - expected;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/account-balance-checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance, memo: balanceMemo })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMessage(`저장 실패: ${data.message ?? res.status}`);
        return;
      }
      setBalanceInput("");
      setBalanceMemo("");
      setMessage(
        diff === 0
          ? "실제 잔액을 저장했습니다. 장부상 예상 잔액과 정확히 일치합니다."
          : `실제 잔액을 저장했습니다. 직전 예상 잔액과 ${won(Math.abs(diff))} ${diff > 0 ? "더 많습니다" : "부족합니다"} — 원인을 확인해보세요.`
      );
      await load();
    } catch (e) {
      setMessage(`오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(entryAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("금액을 올바르게 입력해주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/account-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDate, direction: entryDirection, amount, category: entryCategory, memo: entryMemo })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMessage(`저장 실패: ${data.message ?? res.status}`);
        return;
      }
      setEntryAmount("");
      setEntryMemo("");
      setMessage("수기 입출금 기록이 저장되었습니다.");
      await load();
    } catch (e) {
      setMessage(`오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/account-ledger/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setMessage(`삭제 실패: ${data.message ?? res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {message ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            message.includes("실패") || message.includes("오류") || message.includes("부족") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
          }`}
        >
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">장부 ↔ 실제 계좌잔액 대사</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            은행 API 연동이 없어 실시간 조회는 안 되지만, 실제 통장 잔액을 주기적으로 입력해두면 그 시점 이후 시스템에 기록된
            입출금(가상계좌 입금·환불·경비)과 수기 기록을 합산해 &quot;지금쯤 이 정도여야 한다&quot;는 예상 잔액을 계산해 비교할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-bold text-slate-500">최근 확인한 실제 잔액</p>
                  {latestCheckpoint ? (
                    <>
                      <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-50">{won(latestCheckpoint.balance)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatKstDateTime(latestCheckpoint.checked_at)} 확인{latestCheckpoint.memo ? ` · ${latestCheckpoint.memo}` : ""}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">아직 입력된 잔액이 없습니다. 아래에서 처음 등록해주세요.</p>
                  )}
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300">장부상 예상 잔액 (지금 기준)</p>
                  <p className="mt-1 text-xl font-black text-blue-900 dark:text-blue-100">{won(reconciliation?.expectedBalance ?? 0)}</p>
                  {reconciliation ? (
                    <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-300/80">
                      입금 +{won(reconciliation.autoDepositTotal)} · 자동환불 -{won(reconciliation.autoRefundTotal)} · 수동환불 -
                      {won(reconciliation.manualRefundTotal)} · 경비 -{won(reconciliation.expenseTotal)} · 수기 +
                      {won(reconciliation.manualLedgerInTotal)}/-{won(reconciliation.manualLedgerOutTotal)}
                    </p>
                  ) : null}
                </div>
              </div>

              <form onSubmit={submitCheckpoint} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">오늘 실제 통장 잔액 입력</span>
                  <input
                    type="number"
                    min="0"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    placeholder="예: 2450000"
                    className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                    required
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">메모(선택)</span>
                  <input
                    value={balanceMemo}
                    onChange={(e) => setBalanceMemo(e.target.value)}
                    placeholder="예: 통장 확인"
                    className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? "저장 중…" : "잔액 저장 + 비교"}
                </button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">계좌 수기 입출금 기록</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">가상계좌 입금·환불·경비 외에 은행수수료·이자 등 시스템에 자동으로 안 잡히는 항목을 직접 기록합니다.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitEntry} className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">날짜</span>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">구분</span>
              <select
                value={entryDirection}
                onChange={(e) => setEntryDirection(e.target.value as LedgerDirection)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              >
                <option value="IN">입금</option>
                <option value="OUT">출금</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">금액</span>
              <input
                type="number"
                min="1"
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">분류</span>
              <select
                value={entryCategory}
                onChange={(e) => setEntryCategory(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              >
                {LEDGER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm flex-1 min-w-[160px]">
              <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">메모</span>
              <input
                value={entryMemo}
                onChange={(e) => setEntryMemo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "저장 중…" : "기록 추가"}
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">날짜</th>
                  <th className="px-3 py-2">구분</th>
                  <th className="px-3 py-2">금액</th>
                  <th className="px-3 py-2">분류</th>
                  <th className="px-3 py-2">메모</th>
                  <th className="px-3 py-2">삭제</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                      수기 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">{entry.entry_date}</td>
                      <td className="px-3 py-2">
                        <span className={`font-bold ${entry.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>
                          {entry.direction === "IN" ? "입금" : "출금"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{won(entry.amount)}</td>
                      <td className="px-3 py-2">{entry.category}</td>
                      <td className="px-3 py-2 text-slate-500">{entry.memo ?? "-"}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void deleteEntry(entry.id)}
                          className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-slate-950"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

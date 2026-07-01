"use client";

import { useEffect, useState, useCallback } from "react";
import type { FollowUpReminder } from "@/lib/crm-db";

function weekRange() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}

const STATUS_LABEL: Record<string, string> = { pending: "대기", sent: "발송", skipped: "건너뜀" };
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  sent: "bg-green-100 text-green-700",
  skipped: "bg-slate-100 text-slate-500",
};

export default function CrmFollowUpPage() {
  const [reminders, setReminders] = useState<FollowUpReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { from, to } = weekRange();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/crm/follow-up?from=${from}&to=${to}`, { cache: "no-store" });
      const json = await res.json() as { reminders: FollowUpReminder[] };
      setReminders(json.reminders ?? []);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const sendOne = async (id: string) => {
    setSendingId(id);
    setMsg(null);
    try {
      const res = await fetch("/api/crm/follow-up-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json() as { sent?: boolean; error?: string };
      setMsg(json.sent ? "✅ 문자 발송 완료" : "❌ " + (json.error ?? "발송 실패"));
      void load();
    } catch (e) {
      setMsg("오류: " + (e as Error).message);
    } finally {
      setSendingId(null);
    }
  };

  const sendAll = async () => {
    setSendingId("all");
    setMsg(null);
    try {
      const res = await fetch("/api/crm/follow-up-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json() as { total?: number; results?: { sent: boolean }[] };
      const sentCount = json.results?.filter((r) => r.sent).length ?? 0;
      setMsg(`✅ ${sentCount}건 발송 완료 (전체 ${json.total}건)`);
      void load();
    } catch (e) {
      setMsg("오류: " + (e as Error).message);
    } finally {
      setSendingId(null);
    }
  };

  const pending = reminders.filter((r) => r.status === "pending");

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">CRM</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">재상담 알림</h1>
        <p className="mt-1 text-sm text-slate-600">이번 주 재상담 예정 · 문자 발송</p>
      </div>

      {msg && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
          {msg}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          이번 주 총 <span className="font-bold text-slate-900">{reminders.length}건</span>
          {pending.length > 0 && <span className="ml-2 text-amber-600">(대기 {pending.length}건)</span>}
        </p>
        {pending.length > 0 && (
          <button
            onClick={sendAll}
            disabled={sendingId !== null}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {sendingId === "all" ? "발송 중..." : `대기 ${pending.length}건 일괄 발송`}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-slate-500">불러오는 중...</p>
        ) : reminders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center shadow-sm">
            <p className="text-slate-400">이번 주 재상담 알림이 없습니다.</p>
          </div>
        ) : reminders.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-slate-900">{r.customer_name}</span>
                <span className="text-slate-500 text-sm">{r.customer_phone}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="text-sm text-slate-600 line-clamp-2">{r.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                알림 예정: {new Date(r.remind_at).toLocaleString("ko-KR")}
              </p>
            </div>
            {r.status === "pending" && (
              <button
                onClick={() => sendOne(r.id)}
                disabled={sendingId !== null}
                className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {sendingId === r.id ? "발송 중..." : "문자 발송"}
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

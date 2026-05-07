"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import type { AdminOrderRow } from "@/lib/orders-pg";
import type { Reservation } from "@/lib/reservations-store";
import {
  finalPaymentStatusKo,
  orderPaymentStatusKo,
  reservationStatusKo,
  taskStatusKo
} from "@/lib/admin-customer-care-display";
import { cn } from "@/lib/utils";

type WorkerRow = { id: string; name: string; phone: string; active: boolean; createdAt: string };

const EMPTY_RESERVATIONS: Reservation[] = [];
const EMPTY_ORDERS: AdminOrderRow[] = [];
const EMPTY_WORKERS: WorkerRow[] = [];

type Snapshot = {
  orders?: AdminOrderRow[];
  reservations?: Reservation[];
  workers?: WorkerRow[];
  message?: string;
};

function norm(s: string | undefined | null) {
  return String(s ?? "").trim().toUpperCase();
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "default" | "warn" | "ok" | "danger" }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-950"
          : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={cn("rounded-xl border px-3 py-2", toneClass)}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminHomeMonitorDashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/console-snapshot", { cache: "no-store" });
      const json = (await response.json()) as Snapshot;
      if (!response.ok) {
        setError(json.message ?? `조회 실패 (${response.status})`);
        setData(null);
        return;
      }
      setError(null);
      setData(json);
      setSyncedAt(new Date().toLocaleString("ko-KR"));
    } catch {
      setError("네트워크 오류로 스냅샷을 불러오지 못했습니다.");
      setData(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    let unsub = () => {};
    try {
      const supabase = createBrowserSupabase();
      const ch = supabase
        .channel("admin-home-monitor")
        .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void refresh())
        .subscribe();
      unsub = () => {
        void supabase.removeChannel(ch);
      };
    } catch {
      // realtime optional
    }
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 12000);
    return () => {
      window.clearInterval(poll);
      unsub();
    };
  }, [refresh]);

  const reservations = data?.reservations ?? EMPTY_RESERVATIONS;
  const orders = data?.orders ?? EMPTY_ORDERS;
  const workers = data?.workers ?? EMPTY_WORKERS;

  const reception = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const r of reservations) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    const open = reservations.filter((r) => r.status !== "완료").length;
    const emergencyOpen = reservations.filter((r) => r.priority === "emergency" && r.status !== "완료").length;
    const recent = reservations.slice(0, 8);
    return { byStatus, open, emergencyOpen, recent };
  }, [reservations]);

  const crew = useMemo(() => {
    const active = workers.filter((w) => w.active).length;
    let assigned = 0;
    let inProgress = 0;
    let completed = 0;
    const load = new Map<string, { name: string; count: number }>();
    for (const r of reservations) {
      const ts = r.taskStatus;
      if (ts === "assigned") assigned += 1;
      if (ts === "in_progress") inProgress += 1;
      if (ts === "completed") completed += 1;
      if ((ts === "assigned" || ts === "in_progress") && r.assignedWorkerId) {
        const id = r.assignedWorkerId;
        const cur = load.get(id) ?? { name: r.assignedWorkerName ?? "기사", count: 0 };
        cur.count += 1;
        if (r.assignedWorkerName) cur.name = r.assignedWorkerName;
        load.set(id, cur);
      }
    }
    const topLoad = [...load.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6);
    const activeRows = reservations.filter((r) => r.taskStatus === "in_progress" || r.taskStatus === "assigned").slice(0, 8);
    return { active, total: workers.length, assigned, inProgress, completed, topLoad, activeRows };
  }, [reservations, workers]);

  const money = useMemo(() => {
    let prepPending = 0;
    let prepWaitBank = 0;
    let prepPaid = 0;
    let prepOther = 0;
    let finalRequested = 0;
    let finalPaid = 0;
    let dispatchIdlePaid = 0;
    for (const o of orders) {
      const ps = norm(o.payment_status);
      if (ps === "PENDING") prepPending += 1;
      else if (ps === "WAITING_FOR_DEPOSIT") prepWaitBank += 1;
      else if (ps === "PAID") prepPaid += 1;
      else prepOther += 1;
      const fs = norm(o.final_payment_status);
      if (fs === "REQUESTED") finalRequested += 1;
      if (fs === "PAID") finalPaid += 1;
      const ds = norm(o.dispatch_status);
      if (ps === "PAID" && (ds === "READY" || ds === "IDLE" || ds === "ACTIVE")) dispatchIdlePaid += 1;
    }
    const recent = orders.slice(0, 8);
    return { prepPending, prepWaitBank, prepPaid, prepOther, finalRequested, finalPaid, dispatchIdlePaid, recent };
  }, [orders]);

  if (error) {
    return (
      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
        <p>{error}</p>
        <p className="mt-1 text-xs font-normal text-amber-900/90">
          Supabase 예약 DB가 켜진 환경에서만 메인 모니터링이 동작합니다. 설정 후 새로고침하거나 아래「빠른 이동」으로 각 메뉴를 이용하세요.
        </p>
        <button type="button" onClick={() => void refresh()} className="mt-2 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-bold text-white">
          다시 불러오기
        </button>
      </div>
    );
  }

  if (!data) {
    return <p className="mb-6 text-sm font-semibold text-slate-600">운영 현황을 불러오는 중…</p>;
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">실시간 반영 · 마지막 동기화: {syncedAt || "—"}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg">1. 접수 현황</CardTitle>
              <Link href="/admin/reservations" className="shrink-0 text-xs font-bold text-dk-navy underline-offset-2 hover:underline">
                예약/정산 →
              </Link>
            </div>
            <p className="text-xs text-slate-600">미완료 {reception.open}건 · 긴급 미완료 {reception.emergencyOpen}건</p>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="입금대기(접수)" value={reception.byStatus.waiting_payment ?? 0} tone="warn" />
              <Stat label="접수" value={reception.byStatus["접수"] ?? 0} />
              <Stat label="진행중" value={reception.byStatus["진행중"] ?? 0} tone="ok" />
              <Stat label="완료" value={reception.byStatus["완료"] ?? 0} />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-0 text-left text-xs">
                <thead className="bg-slate-100 font-bold text-slate-600">
                  <tr>
                    <th className="px-2 py-2">상태</th>
                    <th className="px-2 py-2">유형</th>
                    <th className="px-2 py-2">고객</th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reception.recent.map((r) => (
                    <tr key={r.id} className="bg-white">
                      <td className="px-2 py-1.5 font-bold text-slate-800">{reservationStatusKo(r.status)}</td>
                      <td className="px-2 py-1.5 text-slate-700">{r.priority === "emergency" ? "긴급" : "일반"}</td>
                      <td className="max-w-[7rem] truncate px-2 py-1.5 text-slate-700" title={r.name}>
                        {r.name}
                      </td>
                      <td className="px-1 py-1.5">
                        <Link href={`/admin/reservations?id=${encodeURIComponent(r.id)}`} className="font-bold text-dk-navy hover:underline">
                          보기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg">2. 기사 현황</CardTitle>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Link href="/admin/dispatch" className="text-xs font-bold text-dk-navy underline-offset-2 hover:underline">
                  배정 관제 →
                </Link>
                <Link href="/admin/technicians" className="text-xs font-bold text-slate-600 underline-offset-2 hover:underline">
                  기사 관리 →
                </Link>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              활성 기사 {crew.active}/{crew.total}명 · 배정됨 {crew.assigned} · 현장 {crew.inProgress} · 작업완료(건) {crew.completed}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="배정 대기(건)" value={crew.assigned} tone="warn" />
              <Stat label="현장 진행(건)" value={crew.inProgress} tone="ok" />
              <Stat label="완료 처리(건)" value={crew.completed} />
            </div>
            {crew.topLoad.length > 0 ? (
              <div>
                <p className="mb-1 text-[11px] font-bold text-slate-500">기사별 진행·배정 건수</p>
                <ul className="space-y-1 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs">
                  {crew.topLoad.map(([id, row]) => (
                    <li key={id} className="flex justify-between gap-2 font-semibold text-slate-800">
                      <span className="truncate">{row.name}</span>
                      <span className="tabular-nums text-dk-navy">{row.count}건</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-500">배정·진행 중인 작업이 없습니다.</p>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-0 text-left text-xs">
                <thead className="bg-slate-100 font-bold text-slate-600">
                  <tr>
                    <th className="px-2 py-2">작업</th>
                    <th className="px-2 py-2">기사</th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {crew.activeRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                        배정·진행 중인 접수가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    crew.activeRows.map((r) => (
                      <tr key={r.id} className="bg-white">
                        <td className="px-2 py-1.5 font-bold text-slate-800">{taskStatusKo(r.taskStatus)}</td>
                        <td className="max-w-[7rem] truncate px-2 py-1.5 text-slate-700" title={r.assignedWorkerName ?? ""}>
                          {r.assignedWorkerName ?? "—"}
                        </td>
                        <td className="px-1 py-1.5">
                          <Link href={`/admin/reservations?id=${encodeURIComponent(r.id)}`} className="font-bold text-dk-navy hover:underline">
                            보기
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-lg">3. 입금·정산 현황</CardTitle>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Link href="/admin/finance" className="text-xs font-bold text-dk-navy underline-offset-2 hover:underline">
                  금융/가상계좌 →
                </Link>
                <Link href="/admin/billing" className="text-xs font-bold text-slate-600 underline-offset-2 hover:underline">
                  현장 정산 →
                </Link>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              예약금 미결제 {money.prepPending + money.prepWaitBank + money.prepOther}건 · 입금완료 {money.prepPaid}건 · 최종정산 요청{" "}
              {money.finalRequested}건
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="예약금 대기" value={money.prepPending} tone="warn" />
              <Stat label="가상계좌 입금중" value={money.prepWaitBank} tone="warn" />
              <Stat label="예약금 입금완료" value={money.prepPaid} tone="ok" />
              <Stat label="배정 대기(입금완료)" value={money.dispatchIdlePaid} tone="danger" />
              <Stat label="최종정산 요청" value={money.finalRequested} tone="warn" />
              <Stat label="최종정산 완료" value={money.finalPaid} />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-0 text-left text-xs">
                <thead className="bg-slate-100 font-bold text-slate-600">
                  <tr>
                    <th className="px-2 py-2">예약금</th>
                    <th className="px-2 py-2">최종</th>
                    <th className="px-2 py-2">고객</th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {money.recent.map((o) => {
                    const ri = o.reservation_id;
                    const name = o.resident_info?.name ?? "—";
                    return (
                      <tr key={o.id} className="bg-white">
                        <td className="px-2 py-1.5 font-bold text-slate-800">{orderPaymentStatusKo(o.payment_status)}</td>
                        <td className="px-2 py-1.5 text-slate-700">{finalPaymentStatusKo(o.final_payment_status)}</td>
                        <td className="max-w-[6rem] truncate px-2 py-1.5 text-slate-700" title={name}>
                          {name}
                        </td>
                        <td className="px-1 py-1.5">
                          {ri ? (
                            <Link href={`/admin/reservations?id=${encodeURIComponent(ri)}`} className="font-bold text-dk-navy hover:underline">
                              보기
                            </Link>
                          ) : (
                            <Link href="/admin/finance" className="font-bold text-slate-500 hover:underline">
                              금융
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
        <strong className="text-slate-800">배정 대기(입금완료)</strong>은 예약금 입금 후{" "}
        <code className="rounded bg-white px-1">dispatch_status=READY</code>(구 스키마: IDLE/ACTIVE)인 주문 수로, 실시간 배정 관제에서 우선 처리할 수 있습니다.
      </div>
    </div>
  );
}

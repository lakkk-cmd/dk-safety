"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import type { ApartmentTenant } from "@/lib/apartments-pg";
import type { AdminOrderRow } from "@/lib/orders-pg";

type SnapshotResponse = {
  apartments: ApartmentTenant[];
  orders: AdminOrderRow[];
};

function isTodayKst(isoText: string) {
  const now = new Date();
  const nowKst = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const target = new Date(isoText);
  const targetKst = new Date(target.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return nowKst === targetKst;
}

export default function FinanceRealtimeDashboard({
  initialApartments,
  initialOrders
}: {
  initialApartments: ApartmentTenant[];
  initialOrders: AdminOrderRow[];
}) {
  const [apartments, setApartments] = useState(initialApartments);
  const [orders, setOrders] = useState(initialOrders);
  const [syncMessage, setSyncMessage] = useState("실시간 동기화 대기 중");

  useEffect(() => {
    setApartments(initialApartments);
    setOrders(initialOrders);
  }, [initialApartments, initialOrders]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};

    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/console-snapshot", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as SnapshotResponse;
        if (disposed) return;
        setApartments(next.apartments ?? []);
        setOrders(next.orders ?? []);
        setSyncMessage(`동기화 완료 · ${new Date().toLocaleTimeString("ko-KR")}`);
      } catch {
        if (!disposed) setSyncMessage("동기화 실패 - 자동 재시도 중");
      }
    };

    void refresh();

    try {
      const supabase = createBrowserSupabase();
      const channel = supabase
        .channel("finance-realtime-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
          void refresh();
        })
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      // ignore realtime setup failures
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(pollId);
      unsubscribe();
    };
  }, []);

  const apartmentById = useMemo(() => new Map(apartments.map((apt) => [apt.id, apt])), [apartments]);
  const rows = useMemo(() => orders.slice(0, 80), [orders]);

  const summary = useMemo(() => {
    const todayPaid = rows.filter((order) => order.payment_status === "PAID" && order.paid_at && isTodayKst(order.paid_at)).length;
    const waitingDeposit = rows.filter((order) => order.payment_status !== "PAID").length;
    const totalPaidAmount = rows
      .filter((order) => order.payment_status === "PAID")
      .reduce((sum, order) => sum + (order.virtual_account_amount ?? order.base_fee ?? 50000), 0);
    const dispatchReadyCount = rows.filter((order) => order.payment_status === "PAID").length;
    return { todayPaid, waitingDeposit, totalPaidAmount, dispatchReadyCount };
  }, [rows]);

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{syncMessage}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">오늘의 입금 완료 건수</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{summary.todayPaid}건</p>
          </CardContent>
        </Card>
        <Card className="border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">미입금 대기 건수</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{summary.waitingDeposit}건</p>
          </CardContent>
        </Card>
        <Card className="border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">총 결제 금액</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{summary.totalPaidAmount.toLocaleString("ko-KR")}원</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
        PAID 상태 {summary.dispatchReadyCount}건은 배정 관제 메뉴에서 즉시 배정 가능한 데이터로 연동됩니다.
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="px-3 py-2">단지명</th>
              <th className="px-3 py-2">동/호수</th>
              <th className="px-3 py-2">가상계좌(기업은행)</th>
              <th className="px-3 py-2">입금액</th>
              <th className="px-3 py-2">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => {
              const apt = apartmentById.get(order.apt_id ?? "");
              const info = order.resident_info ?? {};
              const amount = order.virtual_account_amount ?? 50000;
              const paid = order.payment_status === "PAID";
              return (
                <tr key={order.id} className="border-t border-slate-200 dark:border-slate-700" data-dispatch-ready={paid ? "true" : "false"}>
                  <td className="px-3 py-2">{apt?.name ?? "미지정"}</td>
                  <td className="px-3 py-2">{info.dong ?? "-"}-{info.ho ?? "-"}</td>
                  <td className="px-3 py-2">{order.virtual_account_number ?? "-"}</td>
                  <td className="px-3 py-2">{amount.toLocaleString("ko-KR")}원</td>
                  <td className="px-3 py-2">
                    {paid ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        입금 완료
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        결제대기
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

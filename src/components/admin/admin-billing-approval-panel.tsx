"use client";

import { useState } from "react";
import type { AdminOrderRow } from "@/lib/orders-pg";
import { finalPaymentStatusKo } from "@/lib/admin-customer-care-display";

type ApartmentRow = { id: string; name: string };

type Props = {
  initialOrders: AdminOrderRow[];
  apartments: ApartmentRow[];
};

/**
 * 2026-07-19: "현장 정산 승인" 화면이 읽기 전용 표라 실제 승인 버튼이 없던 문제 —
 * 이미 만들어져 있고 실사용 중인 POST /api/orders/[id]/final-payment (provider: MANUAL)를
 * 그대로 재사용해 승인 버튼을 붙인다. 이 엔드포인트는 고객이 온라인 카드결제로 추가비용을
 * 낼 때(Toss) 자동으로 호출되는 것과 같은 경로 — 계좌이체/현장 현금 등 오프라인으로 받은
 * 경우에 관리자가 수동으로 같은 처리를 트리거하는 용도.
 */
export default function AdminBillingApprovalPanel({ initialOrders, apartments }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apartmentById = new Map(apartments.map((apt) => [apt.id, apt]));

  const approve = async (order: AdminOrderRow) => {
    const name = order.resident_info?.name ?? "고객";
    const amount = (order.total_final_fee ?? order.base_fee ?? 0).toLocaleString("ko-KR");
    if (
      !confirm(
        `${name}님 정산을 승인할까요?\n\n최종 정산액: ${amount}원\n승인하면 디지털 보증서가 즉시 발급되고 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }
    setBusyId(order.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/final-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "MANUAL" })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMessage(`승인 실패: ${data.message ?? res.status}`);
        return;
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, final_payment_status: "PAID", warranty_issued_at: new Date().toISOString() } : o))
      );
      setMessage(`${name}님 정산이 승인되었고 보증서가 발급되었습니다.`);
    } catch (e) {
      setMessage(`승인 중 오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
      {message ? (
        <div
          className={`m-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            message.startsWith("승인 실패") || message.startsWith("승인 중 오류")
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-800"
          }`}
        >
          {message}
        </div>
      ) : null}
      <div className="overflow-x-auto p-4">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th className="px-3 py-2">단지명</th>
              <th className="px-3 py-2">동/호수</th>
              <th className="px-3 py-2">기본료</th>
              <th className="px-3 py-2">최종정산</th>
              <th className="px-3 py-2">차액</th>
              <th className="px-3 py-2">정산상태</th>
              <th className="px-3 py-2">승인</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 40).map((order) => {
              const apt = apartmentById.get(order.apt_id ?? "");
              const info = order.resident_info ?? {};
              const finalFee = order.total_final_fee ?? order.base_fee ?? 0;
              const delta = Math.max(0, finalFee - (order.base_fee ?? 0));
              const status = String(order.final_payment_status ?? "").toUpperCase();
              return (
                <tr key={order.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-3 py-2">{apt?.name ?? "미지정"}</td>
                  <td className="px-3 py-2">
                    {info.dong ?? "-"}-{info.ho ?? "-"}
                  </td>
                  <td className="px-3 py-2">{(order.base_fee ?? 0).toLocaleString("ko-KR")}원</td>
                  <td className="px-3 py-2">{finalFee.toLocaleString("ko-KR")}원</td>
                  <td className="px-3 py-2 font-semibold text-amber-700 dark:text-amber-300">{delta.toLocaleString("ko-KR")}원</td>
                  <td className="px-3 py-2">{finalPaymentStatusKo(order.final_payment_status)}</td>
                  <td className="px-3 py-2">
                    {status === "REQUESTED" ? (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => void approve(order)}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyId === order.id ? "처리 중…" : "승인"}
                      </button>
                    ) : order.warranty_issued_at ? (
                      <span className="text-xs font-semibold text-slate-500">보증서 발급됨</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
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

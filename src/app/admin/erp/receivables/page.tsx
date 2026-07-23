"use client";

import { useEffect, useState } from "react";
import type { ReceivableItem } from "@/lib/financial-ledger";

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function ReceivablesPage() {
  const [items, setItems] = useState<ReceivableItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/erp/receivables", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { receivables?: ReceivableItem[]; total?: number }) => {
        setItems(json.receivables ?? []);
        setTotal(json.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">미수금 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          현장 정산 요청은 됐지만(final_payment_status = 요청됨) 아직 입금이 확인되지 않은 금액입니다. 입금을
          확인하면 <span className="font-semibold">현장 정산 승인</span> 화면에서 처리하세요 — 자동으로 이 목록에서 빠집니다.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-red-50 p-5">
        <p className="text-xs font-semibold text-slate-500">미수금 합계</p>
        <p className="mt-1 text-2xl font-black text-red-600">{formatKRW(total)}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <p className="py-8 text-center text-slate-400">불러오는 중...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-slate-400">미수금이 없습니다 ✅</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">고객</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">주소</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">미수금액</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">경과일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.orderId} className={`border-t border-slate-100 ${item.agingDays >= 14 ? "bg-red-50/50" : ""}`}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{item.customerName}</td>
                    <td className="px-4 py-3 text-slate-600">{item.apartmentName ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">{formatKRW(item.amountDue)}</td>
                    <td className="px-4 py-3">
                      <span className={item.agingDays >= 14 ? "font-bold text-red-600" : "text-slate-600"}>
                        {item.agingDays}일{item.agingDays >= 14 && " ⚠️"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, Clock, Building2 } from "lucide-react";
import type { AdminOrderRow } from "@/lib/orders-pg";
import { orderPaymentStatusKo } from "@/lib/admin-customer-care-display";

type ApartmentRow = { id: string; name: string };

type Props = {
  initialOrders: AdminOrderRow[];
  apartments: ApartmentRow[];
};

function maskAccount(no: string | null): string {
  if (!no) return "-";
  const d = no.replaceAll(/[^0-9]/g, "");
  if (d.length <= 4) return d;
  return `···${d.slice(-4)}`;
}

function todayKstDateString(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * toLocaleString("ko-KR")은 서버(Node, ICU 데이터 제한)와 브라우저(항상 full ICU)가
 * 오전/오후 표기를 다르게 렌더링해 하이드레이션 불일치를 낸다 — Intl을 아예 안 쓰고
 * KST로 직접 환산해 고정 포맷으로 찍는다(서버·클라이언트 항상 동일한 문자열).
 */
function formatKstDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const PENDING_DEPOSIT_STATUSES = new Set(["WAITING_FOR_DEPOSIT", "PENDING"]);

export default function AdminFinancePanel({ initialOrders, apartments }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const apartmentById = new Map(apartments.map((apt) => [apt.id, apt]));

  const stats = useMemo(() => {
    const today = todayKstDateString();
    let paidTodayCount = 0;
    let paidTodayTotal = 0;
    let pendingDepositCount = 0;
    let pendingDepositTotal = 0;
    let manualRefundCount = 0;
    let manualRefundTotal = 0;
    for (const o of orders) {
      if (o.payment_status === "PAID" && o.paid_at?.slice(0, 10) === today) {
        paidTodayCount += 1;
        paidTodayTotal += o.virtual_account_amount ?? o.base_fee ?? 0;
      }
      if (PENDING_DEPOSIT_STATUSES.has(o.payment_status)) {
        pendingDepositCount += 1;
        pendingDepositTotal += o.virtual_account_amount ?? o.base_fee ?? 0;
      }
      if (o.manual_refund_amount != null && !o.manual_refund_completed_at) {
        manualRefundCount += 1;
        manualRefundTotal += o.manual_refund_amount;
      }
    }
    return { paidTodayCount, paidTodayTotal, pendingDepositCount, pendingDepositTotal, manualRefundCount, manualRefundTotal };
  }, [orders]);

  const matchesSearch = (order: AdminOrderRow) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const apt = apartmentById.get(order.apt_id ?? "");
    const info = order.resident_info ?? {};
    const blob = `${apt?.name ?? ""} ${info.name ?? ""} ${info.dong ?? ""} ${info.ho ?? ""} ${order.virtual_account_number ?? ""}`
      .toLowerCase();
    return blob.includes(q);
  };

  const depositRows = orders.filter((o) => matchesSearch(o) && (PENDING_DEPOSIT_STATUSES.has(o.payment_status) || o.payment_status === "PAID"));
  const refundRows = orders.filter((o) => matchesSearch(o) && o.manual_refund_amount != null);

  const confirmDeposit = async (order: AdminOrderRow) => {
    if (!order.reservation_id) return;
    const info = order.resident_info ?? {};
    if (!confirm(`${info.name ?? "고객"}님 입금을 확인 처리할까요?\n\n금액: ${(order.virtual_account_amount ?? order.base_fee ?? 0).toLocaleString("ko-KR")}원`)) {
      return;
    }
    setBusyId(order.id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/orders/deposit-confirm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: order.reservation_id })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMessage(`입금확인 실패: ${data.message ?? res.status}`);
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, payment_status: "PAID", dispatch_status: "READY" } : o)));
      setMessage(`${info.name ?? "고객"}님 입금이 확인되었습니다.`);
    } catch (e) {
      setMessage(`입금확인 중 오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setBusyId(null);
    }
  };

  const completeManualRefund = async (order: AdminOrderRow) => {
    const info = order.resident_info ?? {};
    if (!confirm(`${info.name ?? "고객"}님께 ${(order.manual_refund_amount ?? 0).toLocaleString("ko-KR")}원을 실제로 계좌 환불하셨나요?\n\n완료 처리하면 이 목록에서 사라집니다.`)) {
      return;
    }
    setBusyId(order.id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/orders/manual-refund-complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setMessage(`환불 완료 처리 실패: ${data.message ?? res.status}`);
        return;
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, manual_refund_completed_at: new Date().toISOString() } : o))
      );
      setMessage(`${info.name ?? "고객"}님 환불이 완료 처리되었습니다.`);
    } catch (e) {
      setMessage(`환불 완료 처리 중 오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">오늘 입금 완료</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paidTodayCount}건</div>
            <p className="text-xs text-muted-foreground">금일 총 {stats.paidTodayTotal.toLocaleString("ko-KR")}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">입금 대기 중</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingDepositCount}건</div>
            <p className="text-xs text-muted-foreground">대기 총액 {stats.pendingDepositTotal.toLocaleString("ko-KR")}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">수동환불 대기</CardTitle>
            <Wallet className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.manualRefundCount}건</div>
            <p className="text-xs text-muted-foreground">환불 필요 총액 {stats.manualRefundTotal.toLocaleString("ko-KR")}원</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="단지명·고객명·동호수·계좌번호로 검색"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        />
      </div>

      {message ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            message.includes("실패") || message.includes("오류") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
          }`}
        >
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" /> 가상계좌 입금 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">단지명</th>
                  <th className="px-3 py-2">동/호수</th>
                  <th className="px-3 py-2">발급 가상계좌</th>
                  <th className="px-3 py-2">입금액</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">마감시각</th>
                  <th className="px-3 py-2">액션</th>
                </tr>
              </thead>
              <tbody>
                {depositRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                      해당하는 건이 없습니다.
                    </td>
                  </tr>
                ) : (
                  depositRows.slice(0, 60).map((order) => {
                    const apt = apartmentById.get(order.apt_id ?? "");
                    const info = order.resident_info ?? {};
                    const isPending = PENDING_DEPOSIT_STATUSES.has(order.payment_status);
                    return (
                      <tr key={order.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-semibold">{apt?.name ?? "미지정"}</td>
                        <td className="px-3 py-2">
                          {info.dong ?? "-"}-{info.ho ?? "-"}
                        </td>
                        <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400">
                          {order.virtual_account_bank ?? "-"} {maskAccount(order.virtual_account_number)}
                        </td>
                        <td className="px-3 py-2">{(order.virtual_account_amount ?? order.base_fee ?? 0).toLocaleString("ko-KR")}원</td>
                        <td className="px-3 py-2">
                          {order.payment_status === "PAID" ? (
                            <Badge className="bg-green-100 text-green-700">입금 완료</Badge>
                          ) : (
                            <Badge className="border-amber-300 bg-amber-50 text-amber-600">{orderPaymentStatusKo(order.payment_status)}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {formatKstDateTime(order.virtual_account_due_at)}
                        </td>
                        <td className="px-3 py-2">
                          {isPending ? (
                            <button
                              type="button"
                              disabled={busyId === order.id}
                              onClick={() => void confirmDeposit(order)}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busyId === order.id ? "처리 중…" : "입금 확인"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">수동환불 대기 (계좌이체 등 자동환불 불가 건)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">단지명</th>
                  <th className="px-3 py-2">고객명</th>
                  <th className="px-3 py-2">동/호수</th>
                  <th className="px-3 py-2">환불 필요 금액</th>
                  <th className="px-3 py-2">취소일시</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">액션</th>
                </tr>
              </thead>
              <tbody>
                {refundRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                      수동환불 대기 건이 없습니다.
                    </td>
                  </tr>
                ) : (
                  refundRows.map((order) => {
                    const apt = apartmentById.get(order.apt_id ?? "");
                    const info = order.resident_info ?? {};
                    const isDone = Boolean(order.manual_refund_completed_at);
                    return (
                      <tr key={order.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 font-semibold">{apt?.name ?? "미지정"}</td>
                        <td className="px-3 py-2">{info.name ?? "-"}</td>
                        <td className="px-3 py-2">
                          {info.dong ?? "-"}-{info.ho ?? "-"}
                        </td>
                        <td className="px-3 py-2 font-bold text-rose-700 dark:text-rose-400">
                          {(order.manual_refund_amount ?? 0).toLocaleString("ko-KR")}원
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {formatKstDateTime(order.cancelled_at)}
                        </td>
                        <td className="px-3 py-2">
                          {isDone ? (
                            <Badge className="bg-green-100 text-green-700">환불 완료</Badge>
                          ) : (
                            <Badge className="border-rose-300 bg-rose-50 text-rose-600">환불 대기</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isDone ? (
                            <span className="text-xs text-slate-400">
                              {formatKstDateTime(order.manual_refund_completed_at)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === order.id}
                              onClick={() => void completeManualRefund(order)}
                              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              {busyId === order.id ? "처리 중…" : "환불 완료 처리"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

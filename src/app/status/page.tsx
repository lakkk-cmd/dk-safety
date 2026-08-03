"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Reservation } from "@/lib/reservations-store";
import { resolveReservationProgressStep } from "@/components/reservation/reservation-status-bar";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import SiteFooter from "@/components/site-footer";

type FieldReportLink = { id: string; status: string } | null;
type OrderLink = { id: string; additionalDueAmount: number } | null;
type Item = { reservation: Reservation; fieldReport: FieldReportLink; order: OrderLink };

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => { requestPayment: (method: string, payload: Record<string, unknown>) => Promise<void> };
  }
}

type TimelineRow = { icon: string; label: string; done: boolean; active: boolean };

function buildTimeline(item: Item): TimelineRow[] {
  const step = resolveReservationProgressStep(item.reservation);
  const fieldReport = item.fieldReport;
  const reportInProgress = fieldReport && fieldReport.status !== "completed";
  const reportDone = fieldReport?.status === "completed";
  const settlementRequested = item.reservation.orderFinalPaymentStatus === "REQUESTED";
  const settlementDone = item.reservation.orderFinalPaymentStatus === "PAID";

  return [
    { icon: "✅", label: "예약 완료", done: true, active: step === 0 },
    { icon: step >= 1 ? "✅" : "⏳", label: "결제 완료", done: step >= 1, active: step === 1 },
    {
      icon: step >= 2 ? "✅" : "⏳",
      label: item.reservation.assignedWorkerName ? `기사 배정 완료 (${item.reservation.assignedWorkerName})` : "기사 배정 완료",
      done: step >= 2,
      active: step === 2
    },
    { icon: step >= 3 ? "✅" : "⏳", label: "점검 진행 중", done: step >= 3, active: step === 3 },
    {
      icon: settlementDone ? "✅" : settlementRequested ? "🔄" : "⏳",
      label: "정산 확정",
      done: settlementDone,
      active: settlementRequested
    },
    { icon: reportDone ? "✅" : reportInProgress ? "🔄" : "⏳", label: "리포트 생성 중", done: Boolean(fieldReport), active: Boolean(reportInProgress) },
    { icon: reportDone ? "✅" : "⏳", label: "발송 완료", done: Boolean(reportDone), active: false }
  ];
}

export default function StatusPage() {
  return (
    <Suspense>
      <StatusPageContent />
    </Suspense>
  );
}

function StatusPageContent() {
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  const search = async (phoneOverride?: string) => {
    const target = (phoneOverride ?? phone).trim();
    setMessage(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/reservations/by-phone?phone=${encodeURIComponent(target)}`, { cache: "no-store" });
      const data = (await response.json()) as { items?: Item[]; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "조회에 실패했습니다.");
        setItems(null);
        return;
      }
      setItems(data.items ?? []);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 결제안내 SMS/알림톡 링크(/status?phone=01012345678)로 들어오면 자동 조회
  useEffect(() => {
    const qPhone = searchParams.get("phone")?.trim() ?? "";
    if (!qPhone) return;
    setPhone(qPhone);
    void search(qPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payFinal = async (item: Item) => {
    if (!item.order || item.order.additionalDueAmount <= 0) return;
    const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "";
    if (!tossClientKey) {
      setMessage("Toss 결제 키가 설정되지 않았습니다.");
      return;
    }
    setPayingOrderId(item.order.id);
    try {
      const scriptId = "toss-payments-sdk";
      if (!document.getElementById(scriptId)) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = scriptId;
          script.src = "https://js.tosspayments.com/v1/payment";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("결제 SDK 로드 실패"));
          document.body.appendChild(script);
        });
      }
      const tossFactory = window.TossPayments;
      if (!tossFactory) throw new Error("Toss SDK를 불러오지 못했습니다.");
      const toss = tossFactory(tossClientKey);
      const origin = window.location.origin;
      const aptCode = item.reservation.apartmentCode ?? "";
      const successUrl = `${origin}/payment/success?flow=final&reservationId=${encodeURIComponent(item.reservation.id)}&aptCode=${encodeURIComponent(aptCode)}`;
      const failUrl = `${origin}/payment/fail?flow=final&reservationId=${encodeURIComponent(item.reservation.id)}&aptCode=${encodeURIComponent(aptCode)}`;
      await toss.requestPayment("카드", {
        amount: item.order.additionalDueAmount,
        orderId: item.order.id,
        orderName: `최종 정산 ${item.order.additionalDueAmount.toLocaleString("ko-KR")}원`,
        customerName: item.reservation.name,
        customerMobilePhone: item.reservation.phone,
        successUrl,
        failUrl
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "결제 호출 실패");
    } finally {
      setPayingOrderId(null);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-dk-gray p-4 pb-16">
      <div className="pt-4">
        <p className="text-2xl font-bold text-dk-navy">내 예약 현황</p>
        <p className="mt-1 text-[15px] text-slate-500">예약하신 휴대폰 번호로 진행 상황을 확인하세요.</p>
      </div>

      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="010-1234-5678"
          inputMode="tel"
          className="soft-input flex-1 text-base"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={loading}
          className="min-h-12 rounded-2xl bg-dk-blue px-5 text-base font-bold text-white disabled:opacity-60"
        >
          {loading ? "조회 중..." : "조회"}
        </button>
      </div>

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      {items === null ? null : items.length === 0 ? (
        <EmptyState icon="📭" title="예약 내역이 없어요" description="입력하신 번호로 등록된 예약을 찾지 못했습니다." />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <SectionCard
              key={item.reservation.id}
              icon="🏠"
              title={`${item.reservation.address}`}
            >
              <p className="text-sm text-slate-500">
                {item.reservation.preferredDate} {item.reservation.preferredTime} · {item.reservation.serviceType}
              </p>
              <ul className="mt-3 space-y-2">
                {buildTimeline(item).map((row) => (
                  <li key={row.label} className="flex items-center gap-2">
                    <span className="text-lg leading-none">{row.icon}</span>
                    <span className={`text-[15px] ${row.active ? "font-bold text-dk-navy" : row.done ? "text-slate-700" : "text-slate-400"}`}>
                      {row.label}
                    </span>
                  </li>
                ))}
              </ul>
              {item.reservation.orderFinalPaymentStatus === "REQUESTED" && item.order && item.order.additionalDueAmount > 0 ? (
                <div className="mt-3 rounded-xl border border-dk-blue bg-[#eef4ff] p-3">
                  <p className="text-sm font-bold text-dk-navy">
                    추가 결제 금액: {item.order.additionalDueAmount.toLocaleString("ko-KR")}원
                  </p>
                  <button
                    type="button"
                    disabled={payingOrderId === item.order.id}
                    onClick={() => void payFinal(item)}
                    className="mt-2 flex min-h-12 w-full items-center justify-center rounded-2xl bg-dk-blue px-5 text-base font-bold text-white disabled:opacity-60"
                  >
                    {payingOrderId === item.order.id ? "결제 진행 중..." : "카드로 결제하기"}
                  </button>
                </div>
              ) : null}
              {item.fieldReport?.status === "completed" ? (
                <Link
                  href={`/diagnosis/${item.fieldReport.id}`}
                  className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-dk-blue px-5 text-base font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
                >
                  <span>📋</span>
                  <span>리포트 확인하기</span>
                </Link>
              ) : null}
            </SectionCard>
          ))}
        </div>
      )}

      <SiteFooter />
    </main>
  );
}

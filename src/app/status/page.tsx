"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Reservation } from "@/lib/reservations-store";
import { resolveReservationProgressStep } from "@/components/reservation/reservation-status-bar";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import SiteFooter from "@/components/site-footer";
import TossFinalSettlementButton from "@/components/payment/toss-final-settlement-button";

type FieldReportLink = { id: string; status: string } | null;
type OrderLink = { id: string; additionalDueAmount: number; finalPaymentStatus: string | null } | null;
type Item = { reservation: Reservation; fieldReport: FieldReportLink; order: OrderLink };

type TimelineRow = { icon: string; label: string; done: boolean; active: boolean };

function buildTimeline(item: Item): TimelineRow[] {
  const step = resolveReservationProgressStep(item.reservation);
  const fieldReport = item.fieldReport;
  const reportInProgress = fieldReport && fieldReport.status !== "completed";
  const reportDone = fieldReport?.status === "completed";
  // item.order.finalPaymentStatus(있으면)를 우선 쓴다 — 한 예약에 order가 2건 이상 걸리는
  // 예외 상황에서 reservations.orderFinalPaymentStatus(별도 조인)가 다른 행을 가리켜
  // 정산 상태가 실제와 어긋나는 걸 방지(2026-08-03 카드결제 시연 중 발견).
  const finalPaymentStatus = item.order?.finalPaymentStatus ?? item.reservation.orderFinalPaymentStatus;
  const settlementRequested = finalPaymentStatus === "REQUESTED";
  const settlementDone = finalPaymentStatus === "PAID";

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
  const [asOpenFor, setAsOpenFor] = useState<string | null>(null);
  const [asForm, setAsForm] = useState({ preferredDate: "", preferredTime: "09:00", detail: "" });
  const [asBusy, setAsBusy] = useState(false);
  const [asError, setAsError] = useState<string | null>(null);
  const [asResultFor, setAsResultFor] = useState<string | null>(null);

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

  const openAsRequest = (reservationId: string) => {
    setAsOpenFor(reservationId);
    setAsForm({ preferredDate: "", preferredTime: "09:00", detail: "" });
    setAsError(null);
  };

  const submitAsRequest = async (sourceReservationId: string) => {
    setAsError(null);
    if (!asForm.preferredDate || !asForm.detail.trim()) {
      setAsError("희망일과 증상 내용을 입력해 주세요.");
      return;
    }
    setAsBusy(true);
    try {
      const res = await fetch("/api/reservations/as-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceReservationId,
          phone,
          preferredDate: asForm.preferredDate,
          preferredTime: asForm.preferredTime,
          detail: asForm.detail
        })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setAsError(data.message ?? "A/S 신청에 실패했습니다.");
        return;
      }
      setAsOpenFor(null);
      setAsResultFor(sourceReservationId);
      void search();
    } finally {
      setAsBusy(false);
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
              {(item.order?.finalPaymentStatus ?? item.reservation.orderFinalPaymentStatus) === "REQUESTED" &&
              item.order &&
              item.order.additionalDueAmount > 0 ? (
                <div className="mt-3 rounded-xl border border-dk-blue bg-[#eef4ff] p-3">
                  <p className="text-sm font-bold text-dk-navy">
                    추가 결제 금액: {item.order.additionalDueAmount.toLocaleString("ko-KR")}원
                  </p>
                  <TossFinalSettlementButton
                    dbOrderId={item.order.id}
                    amount={item.order.additionalDueAmount}
                    orderName={`최종 정산 ${item.order.additionalDueAmount.toLocaleString("ko-KR")}원`}
                    customerName={item.reservation.name}
                    customerMobilePhone={item.reservation.phone}
                    successUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/payment/success?flow=final&reservationId=${encodeURIComponent(item.reservation.id)}&aptCode=${encodeURIComponent(item.reservation.apartmentCode ?? "")}`}
                    failUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/payment/fail?flow=final&reservationId=${encodeURIComponent(item.reservation.id)}&aptCode=${encodeURIComponent(item.reservation.apartmentCode ?? "")}`}
                    onError={setMessage}
                  />
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

              {item.reservation.status === "완료" ? (
                <div className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
                  {asResultFor === item.reservation.id ? (
                    <p className="text-sm font-bold text-emerald-700">✅ A/S 신청이 출장비 무료로 접수되었습니다. 확인 후 연락드리겠습니다.</p>
                  ) : asOpenFor === item.reservation.id ? (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-amber-900">🔧 A/S 신청 (동일 부위 재발 시 출장비 무료)</p>
                      <textarea
                        value={asForm.detail}
                        onChange={(e) => setAsForm((f) => ({ ...f, detail: e.target.value.slice(0, 500) }))}
                        placeholder="증상/요청 내용을 적어주세요 (예: 지난 점검 부위 재발)"
                        rows={3}
                        className="soft-input w-full resize-y text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={asForm.preferredDate}
                          onChange={(e) => setAsForm((f) => ({ ...f, preferredDate: e.target.value }))}
                          className="soft-input text-sm"
                        />
                        <input
                          type="time"
                          value={asForm.preferredTime}
                          onChange={(e) => setAsForm((f) => ({ ...f, preferredTime: e.target.value }))}
                          className="soft-input text-sm"
                        />
                      </div>
                      {asError ? <p className="text-xs font-semibold text-rose-600">{asError}</p> : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAsOpenFor(null)}
                          className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitAsRequest(item.reservation.id)}
                          disabled={asBusy}
                          className="min-h-11 flex-1 rounded-xl bg-amber-600 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {asBusy ? "접수 중..." : "A/S 신청하기"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openAsRequest(item.reservation.id)}
                      className="min-h-12 w-full rounded-xl border-2 border-amber-400 bg-white text-sm font-bold text-amber-900"
                    >
                      🔧 A/S 신청 (출장비 무료)
                    </button>
                  )}
                </div>
              ) : null}
            </SectionCard>
          ))}
        </div>
      )}

      <SiteFooter />
    </main>
  );
}

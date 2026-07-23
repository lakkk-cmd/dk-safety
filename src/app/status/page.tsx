"use client";

import { useState } from "react";
import Link from "next/link";
import type { Reservation } from "@/lib/reservations-store";
import { resolveReservationProgressStep } from "@/components/reservation/reservation-status-bar";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";

type FieldReportLink = { id: string; status: string } | null;
type Item = { reservation: Reservation; fieldReport: FieldReportLink };

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
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    setMessage(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/reservations/by-phone?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
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
    </main>
  );
}

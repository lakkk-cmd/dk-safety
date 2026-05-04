"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

export const ACTIVE_RESERVATION_STORAGE_KEY = "dk-safety:active-reservation";

/** 같은 탭에서 `localStorage` 갱신 후 브로드캐스트할 때 사용합니다. */
export const ACTIVE_RESERVATION_CHANGED_EVENT = "dk-safety:active-reservation-changed";

export type StoredReservation = {
  reservationId: string;
  orderId: string;
  aptCode: string;
  serviceType: string;
  submittedAt: string;
};

export type ReservationProgressSnapshot = Pick<
  Reservation,
  | "status"
  | "isPaid"
  | "taskStatus"
  | "orderPaymentStatus"
  | "orderDispatchStatus"
  | "orderPrepaymentConfirmed"
  | "orderFinalPaymentStatus"
>;

/** 0~4: 접수 → 결제확인 → 배정 → 진행 → 완료 */
export function resolveReservationProgressStep(r: ReservationProgressSnapshot): number {
  const pay = (r.orderPaymentStatus ?? "").toUpperCase();
  const dispatch = (r.orderDispatchStatus ?? "").toUpperCase();
  const task = (r.taskStatus ?? "").toLowerCase();
  const finalPay = r.orderFinalPaymentStatus ?? "";

  if (task === "completed" || pay === "SETTLED" || finalPay === "PAID" || r.status === "완료") {
    return 4;
  }
  if (task === "in_progress" || dispatch === "IN_PROGRESS") {
    return 3;
  }
  if (task === "assigned" || dispatch === "ASSIGNED") {
    return 2;
  }
  if (pay === "PAID" || r.orderPrepaymentConfirmed === true || r.isPaid === true) {
    return 1;
  }
  return 0;
}

function parseStored(raw: string | null): StoredReservation | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const reservationId = typeof o.reservationId === "string" ? o.reservationId.trim() : "";
    const orderId = typeof o.orderId === "string" ? o.orderId.trim() : "";
    const aptCode = typeof o.aptCode === "string" ? o.aptCode.trim() : "";
    const serviceType = typeof o.serviceType === "string" ? o.serviceType.trim() : "";
    const submittedAt = typeof o.submittedAt === "string" ? o.submittedAt.trim() : "";
    if (!reservationId || !orderId || !aptCode || !serviceType || !submittedAt) return null;
    return { reservationId, orderId, aptCode, serviceType, submittedAt };
  } catch {
    return null;
  }
}

const STEPS: { label: string; short: string }[] = [
  { label: "접수 완료", short: "접수" },
  { label: "예약금 확인", short: "결제" },
  { label: "기사 배정", short: "배정" },
  { label: "방문·수리", short: "진행" },
  { label: "완료·보증서", short: "완료" }
];

const POLL_MS = 30_000;

type Props = { aptCode: string };

export default function ReservationStatusBar({ aptCode }: Props) {
  const [stored, setStored] = useState<StoredReservation | null>(null);
  const [reservation, setReservation] = useState<ReservationProgressSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [autoHidden, setAutoHidden] = useState(false);
  const completionTimerRef = useRef<number | null>(null);
  const completionStartedRef = useRef(false);

  const readStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    const next = parseStored(window.localStorage.getItem(ACTIVE_RESERVATION_STORAGE_KEY));
    setStored(next && next.aptCode === aptCode ? next : null);
  }, [aptCode]);

  useEffect(() => {
    readStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_RESERVATION_STORAGE_KEY || e.key === null) readStorage();
    };
    const onLocal = () => readStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_RESERVATION_CHANGED_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_RESERVATION_CHANGED_EVENT, onLocal);
    };
  }, [readStorage]);

  const fetchReservation = useCallback(async () => {
    if (!stored?.reservationId) return;
    try {
      const res = await fetch(`/api/reservations/${encodeURIComponent(stored.reservationId)}`, { cache: "no-store" });
      const data = (await res.json()) as { reservation?: Reservation };
      if (!res.ok || !data.reservation) return;
      const r = data.reservation;
      setReservation({
        status: r.status,
        isPaid: r.isPaid,
        taskStatus: r.taskStatus ?? null,
        orderPaymentStatus: r.orderPaymentStatus ?? null,
        orderDispatchStatus: r.orderDispatchStatus ?? null,
        orderPrepaymentConfirmed: r.orderPrepaymentConfirmed,
        orderFinalPaymentStatus: r.orderFinalPaymentStatus ?? null
      });
    } catch {
      /* ignore */
    }
  }, [stored?.reservationId]);

  useEffect(() => {
    if (!stored?.reservationId) return;
    void fetchReservation();
    const id = window.setInterval(() => void fetchReservation(), POLL_MS);
    return () => window.clearInterval(id);
  }, [stored?.reservationId, fetchReservation]);

  useEffect(() => {
    if (!stored?.reservationId) return;
    let supabase: ReturnType<typeof createBrowserSupabase> | null = null;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    const channel = supabase
      .channel(`reservation-status-${stored.reservationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reservations", filter: `id=eq.${stored.reservationId}` },
        () => void fetchReservation()
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [stored?.reservationId, fetchReservation]);

  const currentStep = useMemo(
    () => (reservation ? resolveReservationProgressStep(reservation) : 0),
    [reservation]
  );

  useEffect(() => {
    if (currentStep !== 4 || !stored || autoHidden || completionStartedRef.current) return;
    completionStartedRef.current = true;
    completionTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(ACTIVE_RESERVATION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setStored(null);
      setReservation(null);
      setAutoHidden(true);
      completionStartedRef.current = false;
    }, 3000);
    return () => {
      if (completionTimerRef.current) {
        window.clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
        completionStartedRef.current = false;
      }
    };
  }, [currentStep, stored, autoHidden]);

  if (!stored || dismissed || autoHidden) {
    return null;
  }

  const progressPct = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div
      className={cn(
        "sticky top-[52px] z-[25] border-b border-amber-900/25 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800",
        "text-amber-50 shadow-[0_4px_18px_rgba(0,0,0,0.12)]"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative mx-auto w-full max-w-3xl px-3 py-2.5 pr-10">
        <button
          type="button"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 text-amber-200/80 transition hover:bg-white/10 hover:text-amber-50"
          aria-label="진행 표시 닫기"
          onClick={() => setDismissed(true)}
        >
          ✕
        </button>
        <p className="text-[11px] font-medium text-amber-200/90">
          <span className="font-semibold text-amber-100">{stored.serviceType}</span>
          <span className="mx-1.5 text-amber-400/60">·</span>
          접수 {new Date(stored.submittedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <ol className="mt-2 flex justify-between gap-0.5 text-[10px] font-semibold leading-tight text-amber-100/85 sm:text-[11px]">
          {STEPS.map((s, i) => (
            <li
              key={s.label}
              className={cn(
                "min-w-0 flex-1 text-center",
                i < currentStep && "text-amber-300/70",
                i === currentStep && "text-amber-50",
                i > currentStep && "text-slate-500"
              )}
            >
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.short}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

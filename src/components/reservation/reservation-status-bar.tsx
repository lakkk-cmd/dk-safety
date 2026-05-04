"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

export const ACTIVE_RESERVATION_STORAGE_KEY = "dk-safety:active-reservation";

/** 같은 탭에서 `localStorage` 갱신 후 브로드캐스트할 때 사용합니다. */
export const ACTIVE_RESERVATION_CHANGED_EVENT = "dk-safety:active-reservation-changed";

/** `localStorage` 키 `dk-safety:active-reservation`에 JSON으로 저장되는 값. */
export type StoredReservation = {
  reservationId: string;
  orderId: string;
  aptCode: string;
  /** 예: "점검/수리", "긴급출동", "기타점검" */
  serviceType: string;
  /** ISO 8601 날짜 문자열 */
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

/** 단계 계산용(주문·작업과 동일한 스네이크 케이스 필드명) */
export type ReservationRow = {
  task_status: string | null;
  payment_status: string | null;
  dispatch_status: string | null;
  prepayment_confirmed: boolean;
};

/**
 * 0~4: 접수 완료 → 결제 완료 → 기사 배정 → 현장 작업 → 완료
 * `orders.payment_status` / `tasks.status` / `dispatch_status` / `prepayment_confirmed` 기준
 */
export function resolveStep(reservation: ReservationRow): number {
  if (reservation.task_status === "completed" || reservation.payment_status === "SETTLED") return 4;
  if (reservation.task_status === "in_progress") return 3;
  if (reservation.task_status === "assigned" || reservation.dispatch_status === "ASSIGNED") return 2;
  if (reservation.payment_status === "PAID" || reservation.prepayment_confirmed) return 1;
  return 0;
}

export function progressSnapshotToReservationRow(s: ReservationProgressSnapshot): ReservationRow {
  return {
    task_status: s.taskStatus ?? null,
    payment_status: s.orderPaymentStatus != null ? String(s.orderPaymentStatus).toUpperCase() : null,
    dispatch_status: s.orderDispatchStatus != null ? String(s.orderDispatchStatus).toUpperCase() : null,
    prepayment_confirmed: Boolean(s.orderPrepaymentConfirmed)
  };
}

/** 앱 `Reservation` 스냅샷(camelCase)을 `ReservationRow`로 바꾼 뒤 `resolveStep` 호출 */
export function resolveReservationProgressStep(r: ReservationProgressSnapshot): number {
  return resolveStep(progressSnapshotToReservationRow(r));
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

export type ProgressStepDef = { key: string; label: string; icon: string };

export const STEPS: ProgressStepDef[] = [
  { key: "submitted", label: "접수 완료", icon: "✓" },
  { key: "paid", label: "결제 완료", icon: "💳" },
  { key: "assigned", label: "기사 배정", icon: "🔨" },
  { key: "working", label: "현장 작업", icon: "⚡" },
  { key: "done", label: "완료", icon: "🛡️" }
];

/** Realtime 미수신·오프라인 대비: 30초마다 `GET /api/reservations/[id]` 폴링 */
const POLL_MS = 30_000;

/** `done`(5단계 중 마지막) 도달 후: `localStorage` 예약 키 제거·상태바 자동 숨김까지 대기 (ms) */
export const DONE_STEP_CLEAR_DELAY_MS = 3000;

/** Supabase `reservations` 행 → 진행 스냅샷 일부 (PK 컬럼명은 `id`, 논리 예약 id = reservationId) */
function patchFromReservationRow(row: Record<string, unknown>): Partial<ReservationProgressSnapshot> {
  const patch: Partial<ReservationProgressSnapshot> = {};
  if (typeof row.status === "string" && row.status.length > 0) {
    patch.status = row.status as ReservationProgressSnapshot["status"];
  }
  if (typeof row.is_paid === "boolean") {
    patch.isPaid = row.is_paid;
  }
  return patch;
}

/** Supabase `orders` 행 → `payment_status` 등 */
function patchFromOrderRow(row: Record<string, unknown>): Partial<ReservationProgressSnapshot> {
  const patch: Partial<ReservationProgressSnapshot> = {};
  if (typeof row.payment_status === "string" && row.payment_status.length > 0) {
    patch.orderPaymentStatus = row.payment_status;
  }
  if (typeof row.dispatch_status === "string" && row.dispatch_status.length > 0) {
    patch.orderDispatchStatus = row.dispatch_status;
  }
  if (typeof row.prepayment_confirmed === "boolean") {
    patch.orderPrepaymentConfirmed = row.prepayment_confirmed;
  }
  if (typeof row.final_payment_status === "string" && row.final_payment_status.length > 0) {
    const v = row.final_payment_status.toUpperCase();
    if (v === "PENDING" || v === "REQUESTED" || v === "PAID" || v === "FAILED" || v === "CANCELLED") {
      patch.orderFinalPaymentStatus = v;
    }
  }
  return patch;
}

/** Supabase `tasks` 행의 `status` → task_status */
function patchFromTaskRow(row: Record<string, unknown>): Partial<ReservationProgressSnapshot> {
  if (typeof row.status !== "string" || row.status.length === 0) {
    return {};
  }
  const s = row.status.toLowerCase();
  if (s === "assigned" || s === "in_progress" || s === "completed") {
    return { taskStatus: s as NonNullable<ReservationProgressSnapshot["taskStatus"]> };
  }
  return { taskStatus: null };
}

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

  const mergeProgressFromRealtime = useCallback((partial: Partial<ReservationProgressSnapshot>) => {
    setReservation((prev) => {
      const base: ReservationProgressSnapshot =
        prev ?? {
          status: "접수",
          isPaid: false,
          taskStatus: null,
          orderPaymentStatus: null,
          orderDispatchStatus: null,
          orderPrepaymentConfirmed: false,
          orderFinalPaymentStatus: null
        };
      return { ...base, ...partial };
    });
  }, []);

  /** 폴링·초기 로드: `/api/reservations/[id]` 단건 조회 */
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
    const intervalId = window.setInterval(() => void fetchReservation(), POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [stored?.reservationId, fetchReservation]);

  /** 예약 UUID(`reservation_id` / reservations.id) 및 주문 id 기준 Realtime — 페이로드로 status·payment_status·task_status 반영 */
  useEffect(() => {
    const reservationId = stored?.reservationId;
    const orderId = stored?.orderId;
    if (!reservationId) return;
    let supabase: ReturnType<typeof createBrowserSupabase> | null = null;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    const filterReservation = `id=eq.${reservationId}`;
    const filterOrderByReservation = `reservation_id=eq.${reservationId}`;
    const filterOrderById = orderId ? `id=eq.${orderId}` : null;
    const filterTaskByReservation = `reservation_id=eq.${reservationId}`;

    const applyRow = (table: string, row: unknown) => {
      if (!row || typeof row !== "object") return;
      const rec = row as Record<string, unknown>;
      if (table === "reservations") mergeProgressFromRealtime(patchFromReservationRow(rec));
      else if (table === "orders") mergeProgressFromRealtime(patchFromOrderRow(rec));
      else if (table === "tasks") mergeProgressFromRealtime(patchFromTaskRow(rec));
    };

    const channel = supabase
      .channel(`reservation-status-rt-${reservationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reservations", filter: filterReservation },
        (payload) => applyRow("reservations", payload.new)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: filterOrderByReservation },
        (payload) => applyRow("orders", payload.new)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: filterOrderByReservation },
        (payload) => applyRow("orders", payload.new)
      );

    if (filterOrderById) {
      channel
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: filterOrderById },
          (payload) => applyRow("orders", payload.new)
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: filterOrderById },
          (payload) => applyRow("orders", payload.new)
        );
    }

    channel
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks", filter: filterTaskByReservation },
        (payload) => applyRow("tasks", payload.new)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks", filter: filterTaskByReservation },
        (payload) => applyRow("tasks", payload.new)
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [stored?.reservationId, stored?.orderId, mergeProgressFromRealtime]);

  const currentStep = useMemo(
    () => (reservation ? resolveReservationProgressStep(reservation) : 0),
    [reservation]
  );

  /** 완료 단계(인덱스 4): 3초 뒤 `dk-safety:active-reservation` 삭제 + 상태바 자동 숨김 */
  useEffect(() => {
    if (currentStep !== 4 || !stored || autoHidden || completionStartedRef.current) return;
    completionStartedRef.current = true;
    completionTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(ACTIVE_RESERVATION_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent(ACTIVE_RESERVATION_CHANGED_EVENT));
      } catch {
        /* ignore */
      }
      setStored(null);
      setReservation(null);
      setAutoHidden(true);
      completionStartedRef.current = false;
    }, DONE_STEP_CLEAR_DELAY_MS);
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

  const submittedLabel = new Date(stored.submittedAt).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <>
      <div
        className={cn(
          "fixed left-0 right-0 top-[52px] z-[25] w-full bg-[#0b1c3a] px-4 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
        )}
        role="status"
        aria-live="polite"
      >
        <div className="relative flex w-full items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-xs leading-snug text-white">
            <span className="font-medium">{stored.serviceType} 접수</span>
            <span className="text-white/60"> · {submittedLabel}</span>
          </p>
          <button
            type="button"
            className="shrink-0 rounded-md p-1.5 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="진행 표시 닫기"
            onClick={() => setDismissed(true)}
          >
            ✕
          </button>
        </div>

        <div className="mt-3 w-full space-y-1.5">
          <div className="flex w-full items-center">
            {STEPS.map((s, i) => (
              <Fragment key={s.key}>
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                      i < currentStep && "bg-[#c9922a] text-white",
                      i === currentStep && "animate-pulse bg-white text-[#0b1c3a] ring-2 ring-[#c9922a]",
                      i > currentStep && "bg-white/20"
                    )}
                    aria-hidden
                  >
                    {i < currentStep ? "✓" : null}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="relative -mx-0.5 h-0.5 min-w-[8px] flex-1" aria-hidden>
                    <div className="h-full w-full rounded-full bg-white/20" />
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full bg-[#c9922a] transition-[width] duration-300",
                        i < currentStep ? "w-full" : "w-0"
                      )}
                    />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
          <ol className="m-0 flex w-full list-none p-0" aria-label="예약 진행 단계">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                className={cn(
                  "min-w-0 flex-1 px-0.5 text-center text-xs leading-tight",
                  i === currentStep ? "font-bold text-white" : "font-normal text-white/50"
                )}
                aria-current={i === currentStep ? "step" : undefined}
              >
                {s.label}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {/* 고정 바 높이만큼 문서 흐름 확보 — 본문이 바 아래에서 시작 */}
      <div className="h-[7.25rem] w-full shrink-0 sm:h-[7.5rem]" aria-hidden />
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import { EmptyState } from "@/components/ui/empty-state";

type Item = {
  task: { id: string; status: string; site_photo_urls: string[]; accepted_at: string | null };
  reservation: Reservation;
};

function statusLabel(status: string, acceptedAt: string | null) {
  if (status === "assigned" && !acceptedAt) return "🔔 확인 필요";
  if (status === "assigned") return "대기중";
  if (status === "in_progress") return "진행중";
  if (status === "completed") return "완료";
  return status;
}

function statusBadgeClass(status: string, acceptedAt: string | null) {
  if (status === "assigned" && !acceptedAt) return "bg-dk-red text-white";
  if (status === "completed") return "bg-dk-green text-white";
  if (status === "in_progress") return "bg-dk-amber text-white";
  return "bg-dk-blue text-white";
}

function todayLabel() {
  return new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
}

/** "2026-07-13" → "7/13(월)" — 목록 카드는 좁아서 짧은 표기 사용 */
function shortDateLabel(preferredDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) return preferredDate;
  const [y, m, d] = preferredDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${m}/${d}(${weekday})`;
}

function isToday(preferredDate: string) {
  const t = new Date();
  const todayYmd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return preferredDate === todayYmd;
}

export default function WorkerDashboard({ apkUrl }: { apkUrl?: string | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [apartmentFilter, setApartmentFilter] = useState("전체");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/worker/tasks", { cache: "no-store" });
      const data = (await response.json()) as { items?: Item[]; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "목록을 불러오지 못했습니다.");
        return;
      }
      setItems(data.items ?? []);
      setMessage(null);
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }, []);

  useEffect(() => {
    void load();
    (async () => {
      try {
        const response = await fetch("/api/worker/me", { cache: "no-store" });
        const data = (await response.json()) as { name?: string };
        if (response.ok && data.name) setWorkerName(data.name);
      } catch {
        // ignore — greeting falls back to generic label
      }
    })();
  }, [load]);

  const apartmentOptions = ["전체", ...Array.from(new Set(items.map((row) => row.reservation.apartmentName ?? "미지정"))).sort((a, b) => a.localeCompare(b))];
  const filteredItems =
    apartmentFilter === "전체" ? items : items.filter((row) => (row.reservation.apartmentName ?? "미지정") === apartmentFilter);
  const sortedItems = [...filteredItems].sort((a, b) => {
    const order: Record<string, number> = { in_progress: 0, assigned: 1, completed: 2 };
    return (order[a.task.status] ?? 9) - (order[b.task.status] ?? 9);
  });
  const statusSummary = [
    { label: "진행중", count: items.filter((i) => i.task.status === "in_progress").length, color: "text-dk-amber" },
    { label: "대기중", count: items.filter((i) => i.task.status === "assigned").length, color: "text-dk-blue" },
    { label: "완료", count: items.filter((i) => i.task.status === "completed").length, color: "text-dk-green" }
  ];
  const emergencyItems = items.filter((row) => row.reservation.priority === "emergency" && row.task.status !== "completed");

  useEffect(() => {
    let closed = false;
    let poll: number | null = null;
    const startPoll = () => {
      if (poll !== null) return;
      poll = window.setInterval(() => {
        if (document.visibilityState !== "visible") return;
        void load();
      }, 8000);
    };
    const stopPoll = () => {
      if (poll !== null) {
        window.clearInterval(poll);
        poll = null;
      }
    };

    const es = new EventSource("/api/worker/tasks/stream");
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; items?: Item[] };
        if (data.type === "tasks" && Array.isArray(data.items)) {
          setItems(data.items);
          setMessage(null);
        }
        if (data.type === "error" && "message" in data) {
          setMessage(String((data as { message?: string }).message));
        }
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      es.close();
      if (!closed) {
        startPoll();
      }
    };
    es.onopen = () => {
      stopPoll();
    };

    return () => {
      closed = true;
      stopPoll();
      es.close();
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xl font-bold text-dk-navy">
          안녕하세요, {workerName ? `${workerName} 기사님` : "기사님"} 👋
        </p>
        <p className="mt-0.5 text-[15px] font-medium text-slate-500">{todayLabel()}</p>
      </div>

      {apkUrl ? (
        <a
          href={apkUrl}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dk-navy/15 bg-white px-4 py-3 text-center text-sm font-bold text-dk-navy shadow-[0_4px_16px_rgba(11,31,58,0.08)]"
        >
          📱 기사 앱 다운로드(APK)
        </a>
      ) : null}

      {emergencyItems.length > 0 ? (
        <div className="rounded-2xl bg-dk-red px-4 py-3 text-white shadow-[0_10px_24px_rgba(229,62,62,0.35)]">
          <p className="text-sm font-bold">🔴 긴급 출동 요청 {emergencyItems.length}건</p>
          <p className="mt-0.5 text-[13px] text-white/85">
            {emergencyItems[0].reservation.name} · {emergencyItems[0].reservation.address}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {statusSummary.map(({ label, count, color }) => (
          <div key={label} className="rounded-2xl bg-white p-3 text-center shadow-[0_4px_16px_rgba(11,31,58,0.08)]">
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
            <p className="mt-0.5 text-[13px] font-semibold text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <Link
        href="/field-report"
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dk-navy bg-white px-5 text-base font-bold text-dk-navy hover:bg-dk-sky"
      >
        <span className="text-xl leading-none">➕</span>
        <span>새 점검 시작</span>
      </Link>

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      <select value={apartmentFilter} onChange={(e) => setApartmentFilter(e.target.value)} className="soft-input w-full text-sm">
        {apartmentOptions.map((option) => (
          <option key={option} value={option}>
            아파트: {option}
          </option>
        ))}
      </select>

      {filteredItems.length === 0 ? (
        <EmptyState icon="🧰" title="오늘 작업이 없어요" description="배정된 작업이 들어오면 여기 표시됩니다." />
      ) : (
        <ul className="space-y-3">
          {sortedItems.map((row) => (
            <li
              key={row.task.id}
              className={`rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(11,31,58,0.08)] ${
                row.task.status === "completed" ? "opacity-60" : ""
              } ${row.reservation.priority === "emergency" && row.task.status !== "completed" ? "ring-2 ring-dk-red" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    {!isToday(row.reservation.preferredDate) ? (
                      <span className="rounded-md bg-dk-red/10 px-1.5 py-0.5 text-xs font-black text-dk-red">
                        {shortDateLabel(row.reservation.preferredDate)}
                      </span>
                    ) : (
                      <span className="rounded-md bg-dk-blue/10 px-1.5 py-0.5 text-xs font-black text-dk-blue">오늘</span>
                    )}
                    <p className="text-lg font-bold text-dk-navy">{row.reservation.preferredTime}</p>
                  </div>
                  <p className="mt-0.5 text-[15px] font-bold text-slate-800">{row.reservation.apartmentName ?? "미지정 아파트"}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{row.reservation.address}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(row.task.status, row.task.accepted_at)}`}
                >
                  {statusLabel(row.task.status, row.task.accepted_at)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{row.reservation.name} · {row.reservation.serviceType}</p>
              {row.reservation.orderTotalFinalFee != null ? (
                <p className="mt-1 text-[13px] font-semibold text-dk-green">
                  최종 정산: {row.reservation.orderTotalFinalFee.toLocaleString("ko-KR")}원
                </p>
              ) : null}

              <div className="mt-3 flex gap-2">
                {row.task.status === "assigned" && !row.task.accepted_at ? (
                  <Link
                    href={`/worker/tasks/${row.task.id}`}
                    className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-dk-red text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(229,62,62,0.28)]"
                  >
                    <span>🔔</span>
                    <span>확인하기(수락/거절)</span>
                  </Link>
                ) : (
                  <>
                    <Link
                      href={`/field-report?reservationId=${row.reservation.id}`}
                      className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-dk-blue text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
                    >
                      <span>🔧</span>
                      <span>점검 시작</span>
                    </Link>
                    <Link
                      href={`/worker/tasks/${row.task.id}`}
                      className="flex min-h-12 items-center justify-center rounded-2xl border-2 border-slate-200 px-4 text-[15px] font-bold text-slate-600"
                    >
                      작업상세
                    </Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";

type Item = {
  task: { id: string; status: string; site_photo_urls: string[] };
  reservation: Reservation;
};

function statusLabel(status: string) {
  if (status === "assigned") return "배정 완료";
  if (status === "in_progress") return "진행 중";
  if (status === "completed") return "작업 완료";
  return status;
}

function statusBadgeClass(status: string) {
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "in_progress") return "bg-amber-100 text-amber-900";
  return "bg-blue-100 text-blue-800";
}

export default function WorkerDashboard() {
  const [items, setItems] = useState<Item[]>([]);
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
  }, [load]);

  const apartmentOptions = ["전체", ...Array.from(new Set(items.map((row) => row.reservation.apartmentName ?? "미지정"))).sort((a, b) => a.localeCompare(b))];
  const filteredItems =
    apartmentFilter === "전체" ? items : items.filter((row) => (row.reservation.apartmentName ?? "미지정") === apartmentFilter);
  const sortedItems = [...filteredItems].sort((a, b) => {
    const order: Record<string, number> = { in_progress: 0, assigned: 1, completed: 2 };
    return (order[a.task.status] ?? 9) - (order[b.task.status] ?? 9);
  });
  const statusSummary = [
    { label: "진행 중", count: items.filter((i) => i.task.status === "in_progress").length },
    { label: "배정대기", count: items.filter((i) => i.task.status === "assigned").length },
    { label: "완료", count: items.filter((i) => i.task.status === "completed").length }
  ];

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
      <div className="rounded-2xl bg-gradient-to-br from-dk-navy to-dk-blue p-4 text-white shadow-[0_12px_30px_rgba(11,28,58,0.35)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white/80">현장 기사</p>
            <h1 className="mt-1 text-2xl font-black">오늘의 작업</h1>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2 text-center">
            <p className="text-xl font-black">{items.length}</p>
            <p className="text-xs font-semibold text-white/85">건</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {statusSummary.map(({ label, count }) => (
            <div key={label} className="rounded-xl bg-white/10 px-2 py-2 text-center">
              <p className="text-lg font-black">{count}</p>
              <p className="text-[11px] font-semibold text-white/85">{label}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 w-full rounded-xl border border-white/30 bg-white/95 py-2 text-sm font-semibold text-dk-navy shadow-sm hover:bg-white"
        >
          새로고침
        </button>
        <select value={apartmentFilter} onChange={(e) => setApartmentFilter(e.target.value)} className="soft-input mt-2 w-full text-sm">
          {apartmentOptions.map((option) => (
            <option key={option} value={option}>
              아파트: {option}
            </option>
          ))}
        </select>
      </div>

      {message ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p> : null}

      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
          배정된 작업이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedItems.map((row) => (
            <li
              key={row.task.id}
              className={`rounded-2xl border p-4 shadow-[0_12px_24px_rgba(11,28,58,0.12)] ${
                row.task.status === "in_progress"
                  ? "border-amber-300 bg-amber-50"
                  : row.task.status === "completed"
                    ? "border-slate-200 bg-slate-50 opacity-70"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{row.reservation.name}</p>
                  <p className="mt-1 text-[11px] font-semibold text-dk-blue">{row.reservation.apartmentName ?? "미지정 아파트"}</p>
                  <p className="mt-1 text-xs text-slate-600">{row.reservation.address}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${statusBadgeClass(row.task.status)}`}>
                  {statusLabel(row.task.status)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {row.reservation.preferredDate} {row.reservation.preferredTime} · {row.reservation.serviceType}
              </p>
              {row.reservation.orderTotalFinalFee != null ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  최종 정산: {row.reservation.orderTotalFinalFee.toLocaleString("ko-KR")}원 · 최종결제:{" "}
                  {row.reservation.orderFinalPaymentStatus ?? "PENDING"}
                </p>
              ) : null}
              {row.reservation.orderWarrantyIssuedAt ? (
                <p className="mt-1 text-[11px] text-emerald-700">
                  보증서 발급: {new Date(row.reservation.orderWarrantyIssuedAt).toLocaleString("ko-KR")}
                </p>
              ) : null}
              <Link
                href={`/worker/tasks/${row.task.id}`}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-dk-navy to-dk-blue py-2.5 text-sm font-bold text-white"
              >
                작업 상세
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

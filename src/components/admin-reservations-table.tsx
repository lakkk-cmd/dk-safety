"use client";

import { useEffect, useMemo, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import { BoltIcon, ShieldIcon } from "@/components/ui/icons";

type Props = {
  initialReservations: Reservation[];
};

const statuses: Reservation["status"][] = ["접수", "진행중", "완료"];

export default function AdminReservationsTable({ initialReservations }: Props) {
  const [reservations, setReservations] = useState(initialReservations);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"전체" | Reservation["status"]>("전체");
  const [priorityFilter, setPriorityFilter] = useState<"전체" | Reservation["priority"]>("전체");
  const [todayOnly, setTodayOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAtDesc" | "preferredDateAsc" | "preferredDateDesc">("createdAtDesc");
  const [page, setPage] = useState(1);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialReservations.map((item) => [item.id, item.note]))
  );
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const pageSize = 8;

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: reservations.length,
      received: reservations.filter((item) => item.status === "접수").length,
      inProgress: reservations.filter((item) => item.status === "진행중").length,
      done: reservations.filter((item) => item.status === "완료").length,
      today: reservations.filter((item) => item.createdAt.slice(0, 10) === today).length,
      emergency: reservations.filter((item) => item.priority === "emergency").length
    };
  }, [reservations]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return reservations
      .filter((item) => {
        const matchesStatus = statusFilter === "전체" ? true : item.status === statusFilter;
        const matchesPriority = priorityFilter === "전체" ? true : item.priority === priorityFilter;
        const matchesToday = todayOnly ? item.createdAt.slice(0, 10) === today : true;
        const matchesQuery =
          lowered.length === 0
            ? true
            : [item.name, item.phone, item.address, item.serviceType, item.detail, item.priority]
                .join(" ")
                .toLowerCase()
                .includes(lowered);
        return matchesStatus && matchesPriority && matchesToday && matchesQuery;
      })
      .sort((a, b) => {
        if (sortBy === "preferredDateAsc") {
          return a.preferredDate.localeCompare(b.preferredDate);
        }
        if (sortBy === "preferredDateDesc") {
          return b.preferredDate.localeCompare(a.preferredDate);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [reservations, query, statusFilter, priorityFilter, todayOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeFilterLabel =
    todayOnly && statusFilter === "전체" && priorityFilter === "전체"
      ? "오늘 접수"
      : priorityFilter === "emergency" && statusFilter === "전체" && !todayOnly
        ? "긴급출동"
        : statusFilter;

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, priorityFilter, todayOnly, sortBy]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateStatus = async (id: string, status: Reservation["status"]) => {
    setLoadingId(id);
    try {
      const response = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        throw new Error("상태 변경에 실패했습니다.");
      }
      const data = (await response.json()) as { reservation: Reservation };
      setReservations((prev) => prev.map((item) => (item.id === id ? data.reservation : item)));
      setToast({ type: "success", message: "상태가 업데이트되었습니다." });
    } catch {
      setToast({ type: "error", message: "상태 변경에 실패했습니다." });
    } finally {
      setLoadingId(null);
    }
  };

  const saveNote = async (id: string) => {
    setLoadingId(id);
    try {
      const response = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteDrafts[id] ?? "" })
      });
      if (!response.ok) {
        throw new Error("메모 저장에 실패했습니다.");
      }
      const data = (await response.json()) as { reservation: Reservation };
      setReservations((prev) => prev.map((item) => (item.id === id ? data.reservation : item)));
      setToast({ type: "success", message: "메모가 저장되었습니다." });
    } catch {
      setToast({ type: "error", message: "메모 저장에 실패했습니다." });
    } finally {
      setLoadingId(null);
    }
  };

  const applyQuickFilter = (type: "전체" | "오늘 접수" | "접수" | "진행중" | "완료" | "긴급출동") => {
    setQuery("");
    setSortBy("createdAtDesc");

    if (type === "전체") {
      setStatusFilter("전체");
      setPriorityFilter("전체");
      setTodayOnly(false);
      return;
    }
    if (type === "오늘 접수") {
      setStatusFilter("전체");
      setPriorityFilter("전체");
      setTodayOnly(true);
      return;
    }
    if (type === "긴급출동") {
      setStatusFilter("전체");
      setPriorityFilter("emergency");
      setTodayOnly(false);
      return;
    }

    setStatusFilter(type);
    setPriorityFilter("전체");
    setTodayOnly(false);
  };

  return (
    <section className="space-y-4">
      {toast ? (
        <div
          className={`fixed right-6 top-6 z-50 rounded-lg px-4 py-2 text-sm text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-6">
          <button
            type="button"
            onClick={() => applyQuickFilter("전체")}
            className={`rounded-lg p-3 text-left text-sm shadow-sm transition ${
              statusFilter === "전체" && priorityFilter === "전체" && !todayOnly
                ? "bg-slate-900 text-white"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-slate-500">전체</p>
            <p className="mt-1 inline-flex items-center gap-1 text-lg font-bold">
              <ShieldIcon className="h-4 w-4 text-slate-500" />
              {stats.total}
            </p>
          </button>
          <button
            type="button"
            onClick={() => applyQuickFilter("오늘 접수")}
            className={`rounded-lg p-3 text-left text-sm shadow-sm transition ${
              todayOnly && statusFilter === "전체" && priorityFilter === "전체"
                ? "bg-primary text-white"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-slate-500">오늘 접수</p>
            <p className="mt-1 inline-flex items-center gap-1 text-lg font-bold">
              <BoltIcon className="h-4 w-4 text-primary" />
              {stats.today}
            </p>
          </button>
          <button
            type="button"
            onClick={() => applyQuickFilter("접수")}
            className={`rounded-lg p-3 text-left text-sm shadow-sm transition ${
              statusFilter === "접수" && priorityFilter === "전체" && !todayOnly
                ? "bg-blue-700 text-white"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-slate-500">접수</p>
            <p className="text-lg font-bold text-blue-700">{stats.received}</p>
          </button>
          <button
            type="button"
            onClick={() => applyQuickFilter("진행중")}
            className={`rounded-lg p-3 text-left text-sm shadow-sm transition ${
              statusFilter === "진행중" && priorityFilter === "전체" && !todayOnly
                ? "bg-amber-600 text-white"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-slate-500">진행중</p>
            <p className="text-lg font-bold text-amber-700">{stats.inProgress}</p>
          </button>
          <button
            type="button"
            onClick={() => applyQuickFilter("완료")}
            className={`rounded-lg p-3 text-left text-sm shadow-sm transition ${
              statusFilter === "완료" && priorityFilter === "전체" && !todayOnly
                ? "bg-emerald-700 text-white"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-slate-500">완료</p>
            <p className="text-lg font-bold text-emerald-700">{stats.done}</p>
          </button>
          <button
            type="button"
            onClick={() => applyQuickFilter("긴급출동")}
            className={`rounded-lg p-3 text-left text-sm shadow-sm transition ${
              priorityFilter === "emergency" && statusFilter === "전체" && !todayOnly
                ? "bg-rose-700 text-white"
                : "bg-white hover:bg-slate-50"
            }`}
          >
            <p className="text-slate-500">긴급출동</p>
            <p className="text-lg font-bold text-rose-700">{stats.emergency}</p>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            현재 필터: {activeFilterLabel} ({filtered.length}건)
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름/연락처/주소 검색"
            className="soft-input w-64 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "전체" | Reservation["status"])}
            className="soft-input text-sm"
          >
            <option value="전체">전체 상태</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as "전체" | Reservation["priority"])}
            className="soft-input text-sm"
          >
            <option value="전체">전체 우선순위</option>
            <option value="normal">일반</option>
            <option value="emergency">긴급출동</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "createdAtDesc" | "preferredDateAsc" | "preferredDateDesc")}
            className="soft-input text-sm"
          >
            <option value="createdAtDesc">최신 접수순</option>
            <option value="preferredDateAsc">희망일 빠른순</option>
            <option value="preferredDateDesc">희망일 늦은순</option>
          </select>
        </div>
        <a href="/api/admin/reservations/export" className="btn-primary px-4 py-2 text-sm">
          CSV 다운로드
        </a>
      </div>

      <div className="surface-card overflow-hidden rounded-2xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-4 py-3">고객명</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">우선순위</th>
              <th className="px-4 py-3">서비스</th>
              <th className="px-4 py-3">희망일</th>
              <th className="px-4 py-3">요청시간</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">요청사항</th>
              <th className="px-4 py-3">현장사진</th>
              <th className="px-4 py-3">관리 메모</th>
              <th className="px-4 py-3">메모 수정</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-slate-500">
                  조건에 맞는 예약이 없습니다.
                </td>
              </tr>
            ) : (
              paginated.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{item.phone}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.priority === "emergency" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.priority === "emergency" ? "긴급출동" : "일반"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.serviceType}</td>
                  <td className="px-4 py-3">{item.preferredDate}</td>
                  <td className="px-4 py-3">{item.preferredTime || "-"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={item.status}
                      disabled={loadingId === item.id}
                      onChange={(e) => updateStatus(item.id, e.target.value as Reservation["status"])}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.detail}</td>
                  <td className="px-4 py-3">
                    {item.imageUrls.length === 0 ? (
                      <span className="text-xs text-slate-400">없음</span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {item.imageUrls.slice(0, 3).map((url, idx) => (
                          <div key={`${item.id}-${idx}`} className="space-y-1">
                            <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`현장사진 ${idx + 1}`} className="h-14 w-14 object-cover" />
                            </a>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-primary hover:bg-slate-50"
                            >
                              원본 보기
                            </a>
                          </div>
                        ))}
                        {item.imageUrls.length > 3 ? (
                          <span className="self-end text-[11px] text-slate-500">+{item.imageUrls.length - 3}장</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-52 flex-col gap-2">
                      <textarea
                        value={noteDrafts[item.id] ?? ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        maxLength={300}
                        placeholder="관리 메모 입력"
                        className="min-h-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => saveNote(item.id)}
                        disabled={loadingId === item.id}
                        className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                      >
                        메모 저장
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {item.noteUpdatedAt ? new Date(item.noteUpdatedAt).toLocaleString("ko-KR") : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>
          총 {filtered.length}건 / {page} / {totalPages} 페이지
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-50"
          >
            이전
          </button>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-slate-200 px-3 py-1 disabled:opacity-50"
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}

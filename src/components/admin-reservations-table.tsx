"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { Reservation } from "@/lib/reservations-store";
import { BoltIcon, ShieldIcon } from "@/components/ui/icons";

type WorkerOption = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
};

type Props = {
  initialReservations: Reservation[];
  /** Supabase Postgres 예약 모드: 폴링 및 기사 배정 UI */
  enableDbSync?: boolean;
  /** URL `?id=` 등으로 특정 예약만 보이게 하고 카드에 포커스(고객관리 등에서 연결) */
  focusReservationId?: string | null;
};

const statuses: Reservation["status"][] = ["waiting_payment", "접수", "진행중", "완료"];

function statusLabel(status: Reservation["status"]) {
  return status === "waiting_payment" ? "입금대기" : status;
}

export default function AdminReservationsTable({
  initialReservations,
  enableDbSync = false,
  focusReservationId = null
}: Props) {
  const [reservations, setReservations] = useState(initialReservations);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [assignWorkerId, setAssignWorkerId] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"전체" | Reservation["status"]>("전체");
  const [priorityFilter, setPriorityFilter] = useState<"전체" | Reservation["priority"]>("전체");
  const [nameFilter, setNameFilter] = useState("전체");
  const [phoneFilter, setPhoneFilter] = useState("전체");
  const [addressFilter, setAddressFilter] = useState("전체");
  const [serviceFilter, setServiceFilter] = useState("전체");
  const [apartmentFilter, setApartmentFilter] = useState("전체");
  const [todayOnly, setTodayOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAtDesc" | "preferredDateAsc" | "preferredDateDesc">("createdAtDesc");
  const [page, setPage] = useState(1);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialReservations.map((item) => [item.id, item.note]))
  );
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const pageSize = 1;

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: reservations.length,
      received: reservations.filter((item) => item.status === "접수").length,
      inProgress: reservations.filter((item) => item.status === "진행중").length,
      done: reservations.filter((item) => item.status === "완료").length,
      today: reservations.filter((item) => item.createdAt.slice(0, 10) === today).length,
      emergency: reservations.filter((item) => item.priority === "emergency").length,
      todayRevenue: reservations
        .filter((item) => item.isPaid && item.paidAt?.slice(0, 10) === today)
        .reduce((sum, item) => sum + item.totalAmount, 0)
    };
  }, [reservations]);

  const nameOptions = useMemo(
    () => ["전체", ...Array.from(new Set(reservations.map((item) => item.name))).sort((a, b) => a.localeCompare(b))],
    [reservations]
  );
  const phoneOptions = useMemo(
    () => ["전체", ...Array.from(new Set(reservations.map((item) => item.phone))).sort((a, b) => a.localeCompare(b))],
    [reservations]
  );
  const addressOptions = useMemo(
    () => ["전체", ...Array.from(new Set(reservations.map((item) => item.address))).sort((a, b) => a.localeCompare(b))],
    [reservations]
  );
  const serviceOptions = useMemo(
    () => ["전체", ...Array.from(new Set(reservations.map((item) => item.serviceType))).sort((a, b) => a.localeCompare(b))],
    [reservations]
  );
  const apartmentOptions = useMemo(
    () => ["전체", ...Array.from(new Set(reservations.map((item) => item.apartmentName ?? "미지정"))).sort((a, b) => a.localeCompare(b))],
    [reservations]
  );

  const filtered = useMemo(() => {
    const sortList = (list: Reservation[]) =>
      [...list].sort((a, b) => {
        if (sortBy === "preferredDateAsc") {
          return a.preferredDate.localeCompare(b.preferredDate);
        }
        if (sortBy === "preferredDateDesc") {
          return b.preferredDate.localeCompare(a.preferredDate);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });

    if (focusReservationId) {
      const exact = reservations.filter((item) => item.id === focusReservationId);
      if (exact.length > 0) {
        return sortList(exact);
      }
      const prefix =
        focusReservationId.length >= 8
          ? reservations.filter((item) => item.id.startsWith(focusReservationId))
          : [];
      return sortList(prefix);
    }

    const today = new Date().toISOString().slice(0, 10);
    return sortList(
      reservations.filter((item) => {
        const matchesStatus = statusFilter === "전체" ? true : item.status === statusFilter;
        const matchesPriority = priorityFilter === "전체" ? true : item.priority === priorityFilter;
        const matchesName = nameFilter === "전체" ? true : item.name === nameFilter;
        const matchesPhone = phoneFilter === "전체" ? true : item.phone === phoneFilter;
        const matchesAddress = addressFilter === "전체" ? true : item.address === addressFilter;
        const matchesService = serviceFilter === "전체" ? true : item.serviceType === serviceFilter;
        const matchesApartment = apartmentFilter === "전체" ? true : (item.apartmentName ?? "미지정") === apartmentFilter;
        const matchesToday = todayOnly ? item.createdAt.slice(0, 10) === today : true;
        return (
          matchesStatus &&
          matchesPriority &&
          matchesName &&
          matchesPhone &&
          matchesAddress &&
          matchesService &&
          matchesApartment &&
          matchesToday
        );
      })
    );
  }, [
    reservations,
    focusReservationId,
    statusFilter,
    priorityFilter,
    nameFilter,
    phoneFilter,
    addressFilter,
    serviceFilter,
    apartmentFilter,
    todayOnly,
    sortBy
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeFilterLabel = focusReservationId
    ? "예약 ID 지정"
    : todayOnly && statusFilter === "전체" && priorityFilter === "전체"
      ? "오늘 접수"
      : priorityFilter === "emergency" && statusFilter === "전체" && !todayOnly
        ? "긴급출동"
        : statusFilter;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, nameFilter, phoneFilter, addressFilter, serviceFilter, apartmentFilter, todayOnly, sortBy]);

  useEffect(() => {
    if (focusReservationId) {
      setPage(1);
    }
  }, [focusReservationId]);

  const focusScrollTargetId = focusReservationId && filtered.length > 0 ? filtered[0].id : null;
  useLayoutEffect(() => {
    if (!focusScrollTargetId) {
      return;
    }
    const el = document.getElementById(`admin-reservation-${focusScrollTargetId}`);
    requestAnimationFrame(() => {
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [focusReservationId, focusScrollTargetId]);

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

  useEffect(() => {
    if (!enableDbSync) {
      return;
    }
    const loadWorkers = () => {
      void (async () => {
        try {
          const response = await fetch("/api/admin/workers", { cache: "no-store" });
          if (!response.ok) return;
          const data = (await response.json()) as { workers?: WorkerOption[] };
          setWorkers(data.workers ?? []);
        } catch {
          // ignore
        }
      })();
    };
    loadWorkers();
    const onRefresh = () => loadWorkers();
    window.addEventListener("dk-admin-workers-refresh", onRefresh);
    return () => window.removeEventListener("dk-admin-workers-refresh", onRefresh);
  }, [enableDbSync]);

  useEffect(() => {
    if (!enableDbSync) {
      return;
    }
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const response = await fetch("/api/admin/reservations-data", { cache: "no-store" });
          if (!response.ok) return;
          const data = (await response.json()) as { reservations?: Reservation[] };
          if (Array.isArray(data.reservations)) {
            setReservations(data.reservations);
          }
        } catch {
          // ignore
        }
      })();
    }, 2800);
    return () => window.clearInterval(id);
  }, [enableDbSync]);

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

  const assignTask = async (reservationId: string) => {
    const workerId = assignWorkerId[reservationId] ?? "";
    if (!workerId) {
      setToast({ type: "error", message: "배정할 기사를 선택해주세요." });
      return;
    }
    setLoadingId(reservationId);
    try {
      const response = await fetch("/api/admin/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, workerId })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "배정에 실패했습니다.");
      }
      const data = (await response.json()) as { reservation: Reservation };
      setReservations((prev) => prev.map((item) => (item.id === reservationId ? data.reservation : item)));
      setToast({ type: "success", message: "기사에게 배정되었습니다." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "배정에 실패했습니다." });
    } finally {
      setLoadingId(null);
    }
  };

  const unassignTask = async (reservationId: string) => {
    setLoadingId(reservationId);
    try {
      const response = await fetch("/api/admin/tasks/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "배정 해제에 실패했습니다.");
      }
      const data = (await response.json()) as { reservation: Reservation };
      setReservations((prev) => prev.map((item) => (item.id === reservationId ? data.reservation : item)));
      setToast({ type: "success", message: "배정이 해제되었습니다." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "배정 해제에 실패했습니다." });
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

  const togglePayment = async (reservationId: string, nextPaid: boolean) => {
    setLoadingId(reservationId);
    try {
      const response = await fetch("/api/admin/reservations/payment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, isPaid: nextPaid })
      });
      const data = (await response.json()) as { reservation?: Reservation; message?: string };
      if (!response.ok || !data.reservation) {
        throw new Error(data.message || "입금 상태 변경에 실패했습니다.");
      }
      setReservations((prev) => prev.map((item) => (item.id === reservationId ? data.reservation! : item)));
      setToast({ type: "success", message: nextPaid ? "입금완료 처리되었습니다." : "미입금 처리되었습니다." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "입금 상태 변경 실패" });
    } finally {
      setLoadingId(null);
    }
  };

  const confirmDepositAndActivate = async (reservationId: string) => {
    setLoadingId(reservationId);
    try {
      const response = await fetch("/api/admin/orders/deposit-confirm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId })
      });
      const data = (await response.json()) as { reservation?: Reservation; message?: string };
      if (!response.ok || !data.reservation) {
        throw new Error(data.message || "입금확인 처리에 실패했습니다.");
      }
      setReservations((prev) => prev.map((item) => (item.id === reservationId ? data.reservation! : item)));
      setToast({ type: "success", message: "입금확인 완료: PAID + 기사 배정 가능 상태로 변경되었습니다." });
    } catch (error) {
      setToast({ type: "error", message: error instanceof Error ? error.message : "입금확인 실패" });
    } finally {
      setLoadingId(null);
    }
  };

  const applyQuickFilter = (type: "전체" | "오늘 접수" | "접수" | "진행중" | "완료" | "긴급출동") => {
    setSortBy("createdAtDesc");
    setNameFilter("전체");
    setPhoneFilter("전체");
    setAddressFilter("전체");
    setServiceFilter("전체");
    setApartmentFilter("전체");

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
      {focusReservationId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100">
          <p>
            <span className="font-bold">예약 ID</span>로 연결된 화면입니다. 다른 접수와 함께 보려면 전체 목록으로 이동하세요.
          </p>
          <Link
            href="/admin/reservations"
            className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-600 dark:bg-indigo-900 dark:text-indigo-50 dark:hover:bg-indigo-800"
          >
            전체 예약 보기
          </Link>
        </div>
      ) : null}

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
        <div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900">
          오늘의 총 매출: {stats.todayRevenue.toLocaleString("ko-KR")}원
        </div>
      </div>

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
          {enableDbSync ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              Supabase DB · 실시간 동기화(폴링)
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
            현재 필터: {activeFilterLabel} ({filtered.length}건)
          </span>
          <select value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} className="soft-input text-sm">
            {nameOptions.map((name) => (
              <option key={name} value={name}>
                고객명: {name}
              </option>
            ))}
          </select>
          <select value={phoneFilter} onChange={(e) => setPhoneFilter(e.target.value)} className="soft-input text-sm">
            {phoneOptions.map((phone) => (
              <option key={phone} value={phone}>
                연락처: {phone}
              </option>
            ))}
          </select>
          <select value={addressFilter} onChange={(e) => setAddressFilter(e.target.value)} className="soft-input text-sm">
            {addressOptions.map((address) => (
              <option key={address} value={address}>
                주소: {address}
              </option>
            ))}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="soft-input text-sm">
            {serviceOptions.map((service) => (
              <option key={service} value={service}>
                서비스: {service}
              </option>
            ))}
          </select>
          <select value={apartmentFilter} onChange={(e) => setApartmentFilter(e.target.value)} className="soft-input text-sm">
            {apartmentOptions.map((apartment) => (
              <option key={apartment} value={apartment}>
                아파트: {apartment}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "전체" | Reservation["status"])}
            className="soft-input text-sm"
          >
            <option value="전체">전체 상태</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
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
        <Link href="/api/admin/reservations/export" className="btn-primary px-4 py-2 text-sm">
          CSV 다운로드
        </Link>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="surface-card rounded-2xl px-4 py-10 text-center text-sm text-slate-500">
            {focusReservationId ? (
              <>
                <p className="font-semibold text-slate-700">해당 예약을 찾을 수 없습니다.</p>
                <p className="mt-2 text-xs text-slate-500">ID가 정확한지 확인하거나, 잠시 후 다시 시도해 주세요.</p>
                <Link href="/admin/reservations" className="mt-4 inline-block text-sm font-bold text-indigo-700 underline">
                  전체 예약 목록
                </Link>
              </>
            ) : (
              "조건에 맞는 예약이 없습니다."
            )}
          </div>
        ) : (
          paginated.map((item) => (
            <article
              key={item.id}
              id={`admin-reservation-${item.id}`}
              className={`surface-card rounded-2xl border p-4 ${
                focusReservationId && (item.id === focusReservationId || item.id.startsWith(focusReservationId))
                  ? "border-indigo-500 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-100 dark:border-indigo-400 dark:ring-offset-slate-900"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900">{item.name}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.phone}</p>
                  <p className="mt-1 text-xs font-semibold text-indigo-700">{item.apartmentName ?? "미지정 아파트"}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.address}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      item.priority === "emergency" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.priority === "emergency" ? "긴급출동" : "일반"}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{item.serviceType}</span>
                  <select
                    value={item.status}
                    disabled={loadingId === item.id}
                    onChange={(e) => updateStatus(item.id, e.target.value as Reservation["status"])}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3">
                <p>
                  <span className="font-semibold text-slate-900">희망일</span> {item.preferredDate}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">요청시간</span> {item.preferredTime || "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">메모수정</span>{" "}
                  {item.noteUpdatedAt ? new Date(item.noteUpdatedAt).toLocaleString("ko-KR") : "-"}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">입금</span> {item.isPaid ? "완료" : "미입금"}
                </p>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-800">요청사항</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.detail}</p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-800">접수 첨부 사진</p>
                  {item.imageUrls.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">첨부 없음</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.imageUrls.slice(0, 5).map((url, idx) => (
                        <a
                          key={`${item.id}-${idx}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-md border border-slate-200"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`접수 첨부 ${idx + 1}`} className="h-16 w-16 object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {enableDbSync ? (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                  <p className="text-xs font-semibold text-indigo-950">기사 배정</p>
                  <p className="mt-1 text-xs text-indigo-900">
                    {item.taskId
                      ? `배정: ${item.assignedWorkerName ?? "-"} · 작업: ${
                          item.taskStatus === "completed"
                            ? "완료"
                            : item.taskStatus === "in_progress"
                              ? "진행 중"
                              : item.taskStatus === "assigned"
                                ? "배정됨"
                                : "-"
                        }`
                      : "미배정 (접수 상태 유지)"}
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      value={assignWorkerId[item.id] ?? ""}
                      onChange={(e) => setAssignWorkerId((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="soft-input flex-1 text-sm"
                    >
                      <option value="">기사 선택</option>
                      {workers
                        .filter((w) => w.active)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.phone})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={loadingId === item.id || item.status === "완료"}
                      onClick={() => void assignTask(item.id)}
                      className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      배정
                    </button>
                    {item.taskId ? (
                      <button
                        type="button"
                        disabled={loadingId === item.id || item.taskStatus === "completed"}
                        onClick={() => void unassignTask(item.id)}
                        className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50"
                      >
                        배정 해제
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold text-emerald-900">정산</p>
                <p className="mt-1 text-xs text-emerald-900">
                  출장비 {item.baseFee.toLocaleString("ko-KR")} + 추가 {item.extraFee.toLocaleString("ko-KR")} = 총{" "}
                  {item.totalAmount.toLocaleString("ko-KR")}원
                </p>
                {item.orderTotalFinalFee != null ? (
                  <p className="mt-1 text-xs text-emerald-900">
                    최종 정산(orders): {item.orderTotalFinalFee.toLocaleString("ko-KR")}원 · 상태:{" "}
                    {item.orderFinalPaymentStatus ?? "PENDING"}
                  </p>
                ) : null}
                {item.orderWarrantyIssuedAt ? (
                  <p className="mt-1 text-[11px] text-emerald-800">
                    보증서 발급시각: {new Date(item.orderWarrantyIssuedAt).toLocaleString("ko-KR")}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  {!item.isPaid && item.status === "waiting_payment" ? (
                    <button
                      type="button"
                      onClick={() => void confirmDepositAndActivate(item.id)}
                      disabled={loadingId === item.id}
                      className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      계좌입금 확인(PAID)
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void togglePayment(item.id, !item.isPaid)}
                    disabled={loadingId === item.id}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                      item.isPaid ? "bg-slate-200 text-slate-700" : "bg-emerald-600 text-white"
                    }`}
                  >
                    {item.isPaid ? "미입금으로 변경" : "입금완료로 변경"}
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-800">관리 메모</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <textarea
                    value={noteDrafts[item.id] ?? ""}
                    onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    maxLength={300}
                    placeholder="관리 메모 입력"
                    className="min-h-20 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => saveNote(item.id)}
                    disabled={loadingId === item.id}
                    className="h-fit rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    메모 저장
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-slate-600">
        <select
          value={page}
          onChange={(e) => setPage(Number(e.target.value))}
          aria-label="페이지 선택"
          className="min-w-0 max-w-full flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs sm:max-w-md sm:flex-initial dark:border-slate-600 dark:bg-slate-900"
        >
          {filtered.map((item, idx) => {
            const value = idx + 1;
            return (
              <option key={item.id} value={value}>
                {value}. {item.name} ({item.phone}) · {item.preferredDate} {item.preferredTime || ""}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
          className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600"
        >
          이전
        </button>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={page >= totalPages}
          className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600"
        >
          다음
        </button>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminCustomerCareRow } from "@/lib/admin-customer-care";
import {
  buildReservationDisplayIdById,
  finalPaymentStatusKo,
  orderDispatchStatusKo,
  orderPaymentStatusKo,
  reservationStatusKo,
  taskStatusKo
} from "@/lib/admin-customer-care-display";

type FilterKey =
  | "reservationId"
  | "customer"
  | "address"
  | "schedule"
  | "status"
  | "order"
  | "payment"
  | "settlement"
  | "worker";

function maskAccount(no: string | null): string {
  if (!no) return "-";
  const d = no.replaceAll(/[^0-9]/g, "");
  if (d.length <= 4) return d;
  return `···${d.slice(-4)}`;
}

const FILTER_LABELS: Record<FilterKey, string> = {
  reservationId: "예약 ID",
  customer: "고객",
  address: "주소·단지",
  schedule: "일정",
  status: "예약상태",
  order: "주문",
  payment: "입금/배정",
  settlement: "정산·보증",
  worker: "기사"
};

function normBlob(s: string): string {
  return s.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function rowMatchesSearch(r: EnrichedRow, filters: Record<FilterKey, string>): boolean {
  for (const key of Object.keys(filters) as FilterKey[]) {
    const q = filters[key].trim().toLowerCase();
    if (!q) continue;
    let blob = "";
    switch (key) {
      case "reservationId":
        blob = `${r.reservationId} ${r.displayReservationId}`;
        break;
      case "customer":
        blob = `${r.name} ${r.phone} ${r.serviceType}`;
        break;
      case "address":
        blob = `${r.address} ${r.apartmentName ?? ""} ${r.apartmentCode ?? ""}`;
        break;
      case "schedule":
        blob = `${r.preferredDate} ${r.preferredTime}`;
        break;
      case "status":
        blob = `${r.status} ${reservationStatusKo(r.status)} ${r.isPaid ? "예약금납부" : "미납"}`;
        break;
      case "order":
        blob = `${r.orderId ?? ""} ${r.orderPaymentStatus ?? ""} ${orderPaymentStatusKo(r.orderPaymentStatus)}`;
        break;
      case "payment":
        blob = `${r.virtualAccountNumber ?? ""} ${r.virtualAccountHolder ?? ""} ${r.orderDispatchStatus ?? ""} ${orderDispatchStatusKo(
          r.orderDispatchStatus
        )}`;
        break;
      case "settlement":
        blob = `${r.orderFinalPaymentStatus ?? ""} ${finalPaymentStatusKo(r.orderFinalPaymentStatus)} ${r.orderTotalFinalFee ?? ""} ${
          r.orderWarrantyIssuedAt ? "보증발급" : "보증미발급"
        }`;
        break;
      case "worker":
        blob = `${r.assignedWorkerName ?? ""} ${r.taskStatus ?? ""} ${taskStatusKo(r.taskStatus)}`;
        break;
      default:
        blob = "";
    }
    if (!normBlob(blob).includes(q)) {
      return false;
    }
  }
  return true;
}

type ApartmentOption = { id: string; name: string; code: string };

const PAGE_SIZE = 5;

type Props = {
  initialRows: AdminCustomerCareRow[];
};

type EnrichedRow = AdminCustomerCareRow & { displayReservationId: string };

export default function AdminCustomerCarePanel({ initialRows }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    reservationId: "",
    customer: "",
    address: "",
    schedule: "",
    status: "",
    order: "",
    payment: "",
    settlement: "",
    worker: ""
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [settleBusyId, setSettleBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [apartments, setApartments] = useState<ApartmentOption[]>([]);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    apartmentId: "",
    serviceType: "점검/수리",
    preferredDate: "",
    preferredTime: "09:00",
    detail: "오프라인 접수",
    priority: "normal" as "normal" | "emergency"
  });
  const [page, setPage] = useState(1);
  const [jumpDraft, setJumpDraft] = useState("1");

  const enrichedRows: EnrichedRow[] = useMemo(() => {
    const idMap = buildReservationDisplayIdById(initialRows);
    return initialRows.map((r) => ({
      ...r,
      displayReservationId: idMap.get(r.reservationId) ?? r.reservationId
    }));
  }, [initialRows]);

  const filtered = useMemo(() => enrichedRows.filter((r) => rowMatchesSearch(r, filters)), [enrichedRows, filters]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered.length]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setJumpDraft(String(page));
  }, [page]);

  useEffect(() => {
    if (!showAdd) return;
    void (async () => {
      try {
        const res = await fetch("/api/admin/apartments", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { apartments?: ApartmentOption[] };
        setApartments(Array.isArray(data.apartments) ? data.apartments : []);
      } catch {
        // ignore
      }
    })();
  }, [showAdd]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        next[r.reservationId] = true;
      }
      return next;
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelected({}), []);

  const onDeleteOne = async (id: string) => {
    if (
      !confirm(
        "이 접수 건을 삭제할까요?\n연결된 주문·작업·알림 등이 함께 정리될 수 있으며, 진행 중·완료·정산완료 건은 삭제되지 않습니다."
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/customer-care/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        alert(data.message ?? "삭제에 실패했습니다.");
        return;
      }
      router.refresh();
      setSelected((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    } finally {
      setBusyId(null);
    }
  };

  const onDeleteSelected = async () => {
    const ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      alert("삭제할 항목을 선택해 주세요.");
      return;
    }
    if (!confirm(`선택한 ${ids.length}건을 삭제할까요?`)) return;
    setBatchBusy(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/admin/customer-care/reservations/${encodeURIComponent(id)}`, { method: "DELETE" });
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        if (!res.ok) {
          alert(`${id.slice(0, 8)}… 삭제 실패: ${data.message ?? res.status}`);
          break;
        }
      }
      router.refresh();
      setSelected({});
    } finally {
      setBatchBusy(false);
    }
  };

  const approveSettlement = async (r: EnrichedRow) => {
    if (!r.orderId) return;
    const totalAmount = (r.orderTotalFinalFee ?? 0).toLocaleString("ko-KR");
    const dueAmount = r.orderAdditionalDueAmount.toLocaleString("ko-KR");
    if (
      !confirm(
        `${r.name}님 정산을 승인할까요?\n\n이번에 추가로 받을 금액: ${dueAmount}원\n(전체 정산 총액 ${totalAmount}원 = 출장비 + 추가비용)\n\n승인하면 디지털 보증서가 즉시 발급되고 되돌릴 수 없습니다.`
      )
    ) {
      return;
    }
    setSettleBusyId(r.orderId);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(r.orderId)}/final-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "MANUAL" })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        alert(`승인 실패: ${data.message ?? res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setSettleBusyId(null);
    }
  };

  const submitOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const apt = apartments.find((a) => a.id === form.apartmentId);
    const res = await fetch("/api/admin/customer-care/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        address: form.address,
        apartmentId: form.apartmentId || undefined,
        apartmentName: apt?.name,
        apartmentCode: apt?.code,
        serviceType: form.serviceType,
        preferredDate: form.preferredDate,
        preferredTime: form.preferredTime,
        detail: form.detail,
        priority: form.priority
      })
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      setFormError(data.message ?? "등록에 실패했습니다.");
      return;
    }
    setShowAdd(false);
    setForm({
      name: "",
      phone: "",
      address: "",
      apartmentId: "",
      serviceType: "점검/수리",
      preferredDate: "",
      preferredTime: "09:00",
      detail: "오프라인 접수",
      priority: "normal"
    });
    router.refresh();
  };

  const clearFilters = () =>
    setFilters({
      reservationId: "",
      customer: "",
      address: "",
      schedule: "",
      status: "",
      order: "",
      payment: "",
      settlement: "",
      worker: ""
    });

  return (
    <section className="surface-card rounded-2xl border border-[var(--line-soft)] shadow-[var(--shadow-soft)]">
      <div className="dk-section-head">
        <h3>접수·주문 통합 현황</h3>
        <p>
          열별 검색어는 <strong>부분 일치</strong>(대소문자 무시)입니다. 예약 ID 열은 <strong>YYYYMMDD_순번</strong>(서울 접수일·당일 순서)으로
          보이며, 링크·삭제는 내부 UUID로 처리됩니다. 오프라인 접수는 「접수」 상태로 바로 등록됩니다. 삭제는{" "}
          <strong>진행 중·완료·최종정산 완료</strong> 건에서 제한됩니다.
        </p>
      </div>

      <div className="border-b border-[var(--line-soft)] px-3 py-3 md:px-4">
        <div className="dk-filter-grid">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <div key={key}>
              <label htmlFor={`cf-${key}`}>{FILTER_LABELS[key]}</label>
              <input
                id={`cf-${key}`}
                value={filters[key]}
                onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="검색…"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
        <div className="dk-admin-chips mt-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
            onClick={clearFilters}
          >
            검색 초기화
          </button>
          <button
            type="button"
            className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
            onClick={() => setShowAdd(true)}
          >
            오프라인 접수 등록
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
            onClick={selectAllFiltered}
          >
            현재 목록 전체 선택
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
            onClick={clearSelection}
          >
            선택 해제
          </button>
          <button
            type="button"
            disabled={batchBusy}
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            onClick={() => void onDeleteSelected()}
          >
            선택 삭제
          </button>
          <span className="self-center text-xs text-slate-500">
            한 페이지 {PAGE_SIZE}건 · 검색 결과 {filtered.length} / DB 전체 {enrichedRows.length}건
          </span>
        </div>
      </div>

      <div className="dk-customer-table-wrap px-2 pb-4 pt-1 md:px-3">
        <table className="dk-customer-table">
          <thead>
            <tr>
              <th className="w-10">선택</th>
              <th>예약 ID</th>
              <th>고객</th>
              <th>주소·단지</th>
              <th>일정</th>
              <th>예약상태</th>
              <th>주문</th>
              <th>입금/배정</th>
              <th>정산·보증</th>
              <th>기사</th>
              <th className="w-24">삭제</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="dk-empty-cell">
                  {enrichedRows.length === 0 ? "등록된 접수가 없습니다." : "검색 조건에 맞는 접수가 없습니다."}
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => {
                const reservationId = String(r.reservationId ?? "");
                const displayId = r.displayReservationId;
                return (
                  <tr key={reservationId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[reservationId])}
                        onChange={() => toggleSelect(reservationId)}
                        aria-label={`선택 ${r.name}`}
                      />
                    </td>
                    <td>
                      {reservationId ? (
                        <>
                          <Link
                            href={`/admin/reservations?id=${encodeURIComponent(reservationId)}`}
                            className="dk-link-id"
                            title={`표시 번호 ${displayId} · 내부 ID ${reservationId}`}
                          >
                            {displayId}
                          </Link>
                          <div className="dk-muted-xs">예약/정산 상세</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="dk-cell-strong">{r.name}</div>
                      <div className="dk-muted-xs">{r.phone}</div>
                      <div className="dk-muted-xs">{r.serviceType}</div>
                    </td>
                    <td>
                      <div>{r.address}</div>
                      <div className="dk-muted-xs">
                        {r.apartmentName ? `${r.apartmentName} (${r.apartmentCode ?? "-"})` : "—"}
                      </div>
                    </td>
                    <td className="dk-nowrap">
                      {r.preferredDate} {r.preferredTime}
                    </td>
                    <td>
                      <span className="dk-pill">{reservationStatusKo(r.status)}</span>
                      <div className="dk-muted-xs">{r.isPaid ? "예약금 납부" : "미납"}</div>
                    </td>
                    <td className="dk-mono">
                      {r.orderId ? (
                        <>
                          <div>{String(r.orderId).length > 8 ? `${String(r.orderId).slice(0, 8)}…` : r.orderId}</div>
                          <div className="dk-muted-xs">{orderPaymentStatusKo(r.orderPaymentStatus)}</div>
                        </>
                      ) : (
                        <span className="dk-muted-xs">—</span>
                      )}
                    </td>
                    <td>
                      <div className="dk-mono text-[11px]">가상계좌 {maskAccount(r.virtualAccountNumber)}</div>
                      <div className="dk-muted-xs">{r.virtualAccountHolder ?? "—"}</div>
                      <div className="dk-cell-em">{orderDispatchStatusKo(r.orderDispatchStatus)}</div>
                    </td>
                    <td>
                      <div>{finalPaymentStatusKo(r.orderFinalPaymentStatus)}</div>
                      <div className="dk-muted-xs">
                        총액 {r.orderTotalFinalFee != null ? `${r.orderTotalFinalFee.toLocaleString("ko-KR")}원` : "—"}
                      </div>
                      {String(r.orderFinalPaymentStatus ?? "").toUpperCase() === "REQUESTED" ? (
                        <div className="dk-muted-xs font-bold text-amber-700">
                          추가로 받을 금액 {r.orderAdditionalDueAmount.toLocaleString("ko-KR")}원
                        </div>
                      ) : null}
                      <div className="dk-muted-xs">
                        {r.orderWarrantyIssuedAt
                          ? `보증 ${new Date(r.orderWarrantyIssuedAt).toLocaleDateString("ko-KR")}`
                          : "보증 미발급"}
                      </div>
                      {r.orderId && String(r.orderFinalPaymentStatus ?? "").toUpperCase() === "REQUESTED" ? (
                        <button
                          type="button"
                          disabled={settleBusyId === r.orderId}
                          onClick={() => void approveSettlement(r)}
                          className="mt-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {settleBusyId === r.orderId ? "처리 중…" : "정산 승인"}
                        </button>
                      ) : null}
                    </td>
                    <td>
                      <div>{r.assignedWorkerName ?? "—"}</div>
                      <div className="dk-muted-xs">{taskStatusKo(r.taskStatus)}</div>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={busyId === reservationId}
                        className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                        onClick={() => void onDeleteOne(reservationId)}
                      >
                        {busyId === reservationId ? "삭제 중…" : "삭제"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {filtered.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-2 py-2.5 md:px-3">
            <p className="text-xs text-slate-600">
              <span className="font-bold text-slate-900">
                {page} / {totalPages}
              </span>{" "}
              페이지
              {filtered.length > 0 ? (
                <>
                  {" "}
                  · {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}번째 표시
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1 shadow-sm">
                <label htmlFor="customer-care-page-jump" className="shrink-0 pl-0.5 text-[11px] font-bold text-slate-500">
                  페이지
                </label>
                <input
                  id="customer-care-page-jump"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={totalPages}
                  value={jumpDraft}
                  onChange={(e) => setJumpDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const n = Number.parseInt(jumpDraft.trim(), 10);
                    if (!Number.isFinite(n)) {
                      setJumpDraft(String(page));
                      return;
                    }
                    setPage(Math.min(Math.max(1, n), totalPages));
                  }}
                  className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center text-xs font-black text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[11px] font-semibold text-slate-400">/ {totalPages}</span>
                <button
                  type="button"
                  onClick={() => {
                    const n = Number.parseInt(jumpDraft.trim(), 10);
                    if (!Number.isFinite(n)) {
                      setJumpDraft(String(page));
                      return;
                    }
                    setPage(Math.min(Math.max(1, n), totalPages));
                  }}
                  className="rounded-md bg-dk-navy px-2 py-0.5 text-[11px] font-bold text-white hover:brightness-110"
                >
                  이동
                </button>
              </div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 disabled:opacity-40"
              >
                이전
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        ) : filtered.length > 0 ? (
          <div className="border-t border-slate-100 px-2 py-2 text-center text-[11px] text-slate-500 md:px-3">
            검색 결과 {filtered.length}건 (한 페이지 {PAGE_SIZE}건)
          </div>
        ) : null}
      </div>

      {showAdd ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-add-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h4 id="offline-add-title" className="text-lg font-black text-slate-900">
              오프라인 접수 등록
            </h4>
            <p className="mt-1 text-xs text-slate-600">현장·전화로 접수한 건을 DB에 반영합니다. 상태는 「접수」로 저장됩니다.</p>
            <form className="mt-4 space-y-3" onSubmit={(e) => void submitOffline(e)}>
              <div>
                <label className="text-xs font-bold text-slate-600">고객명 *</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  maxLength={20}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">연락처 *</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="010-1234-5678"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">방문 주소 *</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  required
                  maxLength={120}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">아파트 단지 (선택)</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.apartmentId}
                  onChange={(e) => setForm((f) => ({ ...f, apartmentId: e.target.value }))}
                >
                  <option value="">미지정</option>
                  {apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">서비스 유형 *</label>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.serviceType}
                  onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
                  list="svc-suggest"
                  required
                />
                <datalist id="svc-suggest">
                  <option value="점검/수리" />
                  <option value="누전 점검" />
                  <option value="정기 안전진단" />
                  <option value="긴급 출동" />
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-600">희망일 *</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                    value={form.preferredDate}
                    onChange={(e) => setForm((f) => ({ ...f, preferredDate: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">희망 시간 *</label>
                  <input
                    type="time"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                    value={form.preferredTime}
                    onChange={(e) => setForm((f) => ({ ...f, preferredTime: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">우선순위</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as "normal" | "emergency" }))}
                >
                  <option value="normal">일반</option>
                  <option value="emergency">긴급출동</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">요청 내용</label>
                <textarea
                  className="mt-1 min-h-[72px] w-full rounded-md border border-slate-200 px-2 py-2 text-sm"
                  value={form.detail}
                  onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                  maxLength={500}
                />
              </div>
              {formError ? <p className="text-sm font-semibold text-rose-600">{formError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800"
                  onClick={() => {
                    setShowAdd(false);
                    setFormError(null);
                  }}
                >
                  취소
                </button>
                <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
                  등록
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

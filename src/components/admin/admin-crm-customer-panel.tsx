"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CustomerSummary } from "@/lib/crm-db";

type BulkImportResult = { created: number; total: number; skipped: { row: number; reason: string }[] };

const PAGE_SIZE = 10;

function formatDate(s: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("ko-KR");
}

function formatDateTime(s: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * 고객별(전화번호 단위) 보기 — 예약별 보기(AdminCustomerCarePanel)와 같은 페이지의 다른 탭.
 * 2026-07-19: 별도 페이지(/admin/crm/customers)였던 것을 /admin/customers 탭으로 통합.
 * 2026-09-10: 예약/상담기록을 매번 즉석 집계하던 가상 뷰에서 실제 crm_customers 테이블 기반으로
 * 전환(대표님 결정: "가망 잠재고객도 실제 고객데이터로 저장") — 이제 이름/연락처/주소를 직접
 * 수정할 수 있고, 번호 변경 등으로 나뉜 동일인은 병합할 수 있다.
 */
export default function AdminCrmCustomerPanel() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [viaOptions, setViaOptions] = useState<{ value: string; count: number }[]>([]);
  const [viaFilter, setViaFilter] = useState<string | null>(null);

  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadAddress, setLeadAddress] = useState("");
  const [leadMemo, setLeadMemo] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadMessage, setLeadMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [mergePrimaryId, setMergePrimaryId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", phone: "", address: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async (q: string, p: number, via: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, page: String(p), pageSize: String(PAGE_SIZE) });
      if (via) params.set("via", via);
      const res = await fetch(`/api/admin/crm/customers?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { customers: CustomerSummary[]; total: number; viaOptions: { value: string; count: number }[] };
      setCustomers(json.customers);
      setTotal(json.total);
      setViaOptions(json.viaOptions ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query, page, viaFilter);
  }, [load, query, page, viaFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, viaFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !leadPhone.trim()) {
      setLeadMessage("이름과 연락처를 입력하세요.");
      return;
    }
    setLeadSubmitting(true);
    setLeadMessage(null);
    try {
      const res = await fetch("/api/admin/crm/customers/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName.trim(),
          phone: leadPhone.trim(),
          address: leadAddress.trim(),
          memo: leadMemo.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setLeadMessage(json.error ?? "등록 실패");
        return;
      }
      setLeadName("");
      setLeadPhone("");
      setLeadAddress("");
      setLeadMemo("");
      setLeadFormOpen(false);
      await load(query, page, viaFilter);
    } catch (err) {
      setLeadMessage(err instanceof Error ? err.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setLeadSubmitting(false);
    }
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkImporting(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/crm/customers/bulk-import", { method: "POST", body: form });
      const json = (await res.json()) as BulkImportResult & { error?: string };
      if (!res.ok) {
        setBulkError(json.error ?? "일괄등록 실패");
        return;
      }
      setBulkResult(json);
      await load(query, page, viaFilter);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "일괄등록 중 오류가 발생했습니다.");
    } finally {
      setBulkImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSelect = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const clearSelection = () => {
    setSelected({});
    setMergePrimaryId(null);
  };
  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const openEdit = (c: CustomerSummary) => {
    setEditingId(c.id);
    setEditDraft({ name: c.name, phone: c.phone, address: c.address ?? "" });
    setEditError(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };
  const saveEdit = async (id: string) => {
    setEditError(null);
    if (!editDraft.name.trim() || !editDraft.phone.trim()) {
      setEditError("이름과 연락처는 비워둘 수 없습니다.");
      return;
    }
    setEditBusy(true);
    try {
      const res = await fetch(`/api/admin/crm/customers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft)
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEditError(json.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingId(null);
      await load(query, page, viaFilter);
    } finally {
      setEditBusy(false);
    }
  };

  const hideSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.length}명을 목록에서 숨길까요? 원본 예약·상담기록은 그대로 유지됩니다.`)) return;
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/crm/customers/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds })
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setActionMessage(json.message ?? json.error ?? null);
      if (res.ok) {
        clearSelection();
        await load(query, page, viaFilter);
      }
    } finally {
      setActionBusy(false);
    }
  };

  const confirmMerge = async () => {
    if (!mergePrimaryId) return;
    const secondaryIds = selectedIds.filter((id) => id !== mergePrimaryId);
    if (secondaryIds.length === 0) return;
    const primary = customers.find((c) => c.id === mergePrimaryId);
    if (!window.confirm(`나머지 ${secondaryIds.length}명을 "${primary?.name ?? ""}"(으)로 병합할까요? 예약·상담 이력이 전부 이 고객으로 옮겨집니다.`)) {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/crm/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: mergePrimaryId, secondaryIds })
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setActionMessage(json.message ?? json.error ?? null);
      if (res.ok) {
        clearSelection();
        await load(query, page, viaFilter);
      }
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">고객 프로필(전화번호당 1행 — 잠재고객 포함), 이름/연락처/주소 직접 수정 가능</p>
          <p className="mt-1 text-xs text-slate-400">
            엑셀 첫 행에 &quot;이름&quot;, &quot;연락처&quot;(필수) · &quot;주소&quot;, &quot;메모&quot;(선택) 열이 있으면 됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={bulkImporting}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            {bulkImporting ? "가져오는 중..." : "엑셀로 일괄등록"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void handleBulkImport(e)} />
          <button
            type="button"
            onClick={() => { setLeadFormOpen((v) => !v); setLeadMessage(null); }}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          >
            + 잠재고객 추가
          </button>
        </div>
      </div>

      {(bulkResult || bulkError) && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {bulkError ? (
            <p className="font-semibold text-red-600">엑셀 일괄등록 실패: {bulkError}</p>
          ) : bulkResult ? (
            <>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                엑셀 일괄등록 완료 — 총 {bulkResult.total}행 중 <span className="text-green-700">{bulkResult.created}건 등록</span>
                {bulkResult.skipped.length > 0 && <span className="text-amber-700"> · {bulkResult.skipped.length}건 건너뜀</span>}
              </p>
              {bulkResult.skipped.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {bulkResult.skipped.slice(0, 10).map((s, i) => (
                    <li key={i}>{s.row}행: {s.reason}</li>
                  ))}
                  {bulkResult.skipped.length > 10 && <li>... 외 {bulkResult.skipped.length - 10}건</li>}
                </ul>
              )}
            </>
          ) : null}
        </div>
      )}

      {leadFormOpen && (
        <form onSubmit={(e) => void handleAddLead(e)} className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">잠재고객 등록 — 예약 없이 이름·연락처만 남겨둡니다</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="이름 *"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
            />
            <input
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              placeholder="연락처 *"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
            />
          </div>
          <input
            value={leadAddress}
            onChange={(e) => setLeadAddress(e.target.value)}
            placeholder="주소 (선택)"
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
          />
          <input
            value={leadMemo}
            onChange={(e) => setLeadMemo(e.target.value)}
            placeholder="메모 (선택 — 예: 명함 받은 경로, 관심 항목)"
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
          />
          {leadMessage && <p className="mt-2 text-xs font-semibold text-red-600">{leadMessage}</p>}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={leadSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {leadSubmitting ? "등록 중..." : "등록"}
            </button>
            <button type="button" onClick={() => setLeadFormOpen(false)} className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-bold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
              취소
            </button>
          </div>
        </form>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setViaFilter(null)}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
            viaFilter === null
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          전체 ({viaOptions.reduce((sum, o) => sum + o.count, 0)})
        </button>
        {viaOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setViaFilter(o.value)}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
              viaFilter === o.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {o.value} ({o.count})
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름, 연락처, 주소로 검색"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
        />
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          검색
        </button>
        {query && (
          <button type="button" onClick={() => { setSearch(""); setQuery(""); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
            초기화
          </button>
        )}
      </form>

      {selectedIds.length > 0 && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-rose-700 dark:text-rose-300">{selectedIds.length}명 선택됨</span>
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void hideSelected()}
              className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 disabled:opacity-50"
            >
              선택 숨김(삭제)
            </button>
            {selectedIds.length >= 2 ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => setMergePrimaryId(mergePrimaryId ? null : selectedIds[0])}
                className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-800 disabled:opacity-50"
              >
                동일인 병합
              </button>
            ) : null}
            <button type="button" onClick={clearSelection} className="text-xs font-semibold text-slate-500 hover:underline">
              선택 해제
            </button>
          </div>
          {mergePrimaryId ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3 dark:border-blue-900/40 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">대표로 남길 고객을 선택하세요(나머지는 여기로 합쳐집니다):</p>
              <div className="space-y-1.5">
                {selectedIds.map((id) => {
                  const c = customers.find((x) => x.id === id);
                  if (!c) return null;
                  return (
                    <label key={id} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="merge-primary" checked={mergePrimaryId === id} onChange={() => setMergePrimaryId(id)} />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</span>
                      <span className="text-slate-500">{c.phone}</span>
                      <span className="text-xs text-slate-400">{c.address ?? "-"}</span>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void confirmMerge()}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionBusy ? "병합 중..." : "병합 확정"}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {actionMessage ? <p className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{actionMessage}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900">
                <th className="px-3 py-3"></th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">고객명</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">연락처</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">주소</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">등록경로</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">등록일</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600 dark:text-slate-300">점검 횟수</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">최근 서비스</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">재상담 예정</th>
                <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">상담 기록</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="py-12 text-center text-slate-500">불러오는 중...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={11} className="py-12 text-center text-slate-400">고객 데이터가 없습니다.</td></tr>
              ) : customers.map((c) => {
                const isEditing = editingId === c.id;
                return (
                  <tr key={c.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={Boolean(selected[c.id])} onChange={() => toggleSelect(c.id)} aria-label={`선택 ${c.name}`} />
                    </td>
                    {isEditing ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={editDraft.phone}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, phone: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                        </td>
                        <td className="px-4 py-3" colSpan={2}>
                          <input
                            value={editDraft.address}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, address: e.target.value }))}
                            placeholder="주소"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                          />
                          {editError ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{editError}</p> : null}
                        </td>
                        <td className="px-4 py-3" colSpan={5}>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              disabled={editBusy}
                              onClick={() => void saveEdit(c.id)}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {editBusy ? "저장 중..." : "저장"}
                            </button>
                            <button type="button" disabled={editBusy} onClick={cancelEdit} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">
                              취소
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{c.name}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.phone}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{c.address ?? "-"}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          {c.registeredVia ?? <span className="italic text-slate-400">확인불가</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(c.registeredAt)}</td>
                        <td className="px-4 py-3 text-center">
                          {c.serviceCount === 0 ? (
                            <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                              잠재고객
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                              {c.serviceCount}회
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(c.lastServiceDate)}</td>
                        <td className="px-4 py-3">
                          {c.nextFollowUp ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              {formatDate(c.nextFollowUp)}
                            </span>
                          ) : <span className="text-xs text-slate-400">없음</span>}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`/admin/crm/consultations?phone=${encodeURIComponent(c.phone)}&name=${encodeURIComponent(c.name)}`}
                            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            상담 기록 →
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => openEdit(c)} className="text-xs font-bold text-blue-600 hover:underline">
                            ✏️ 수정
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">총 {total}명 · 실제 고객 데이터(전화번호당 1행, 잠재고객 포함)</p>
        {total > PAGE_SIZE ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              이전
            </button>
            <span className="text-xs font-semibold text-slate-600">{page} / {totalPages}페이지</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

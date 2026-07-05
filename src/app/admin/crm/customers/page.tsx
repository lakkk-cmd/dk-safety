"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CustomerSummary } from "@/lib/crm-db";

type BulkImportResult = { created: number; total: number; skipped: { row: number; reason: string }[] };

function formatDate(s: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("ko-KR");
}

export default function CrmCustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // 잠재고객(예약 없이 명함만) 추가 — consultation_logs에 상담 기록으로 저장,
  // 별도 테이블 없이 기존 상담 인프라를 재사용한다.
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadMemo, setLeadMemo] = useState("");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadMessage, setLeadMessage] = useState<string | null>(null);

  // 엑셀 일괄등록
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/crm/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json() as { customers: CustomerSummary[] };
      setCustomers(json.customers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(query); }, [load, query]);

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
      setLeadMemo("");
      setLeadFormOpen(false);
      await load(query);
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
      await load(query);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "일괄등록 중 오류가 발생했습니다.");
    } finally {
      setBulkImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">CRM</p>
          <h1 className="mt-1 text-3xl font-black text-slate-900">고객 관리</h1>
          <p className="mt-1 text-sm text-slate-600">예약 이력 기반 고객 목록 · 재상담 일정 확인</p>
          <p className="mt-1 text-xs text-slate-400">엑셀 첫 행에 &quot;이름&quot;, &quot;연락처&quot;(필수) · &quot;메모&quot;(선택) 열이 있으면 됩니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={bulkImporting}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          {bulkError ? (
            <p className="font-semibold text-red-600">엑셀 일괄등록 실패: {bulkError}</p>
          ) : bulkResult ? (
            <>
              <p className="font-semibold text-slate-900">
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
        <form onSubmit={(e) => void handleAddLead(e)} className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm">
          <p className="mb-3 text-sm font-bold text-slate-900">잠재고객 등록 — 예약 없이 이름·연락처만 남겨둡니다</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder="이름 *"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              placeholder="연락처 *"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <input
            value={leadMemo}
            onChange={(e) => setLeadMemo(e.target.value)}
            placeholder="메모 (선택 — 예: 명함 받은 경로, 관심 항목)"
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {leadMessage && <p className="mt-2 text-xs font-semibold text-red-600">{leadMessage}</p>}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={leadSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              {leadSubmitting ? "등록 중..." : "등록"}
            </button>
            <button type="button" onClick={() => setLeadFormOpen(false)} className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-bold hover:bg-slate-50">
              취소
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 또는 연락처 검색"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          검색
        </button>
        {query && (
          <button type="button" onClick={() => { setSearch(""); setQuery(""); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-100">
            초기화
          </button>
        )}
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">고객명</th>
                <th className="px-4 py-3 font-semibold text-slate-600">연락처</th>
                <th className="px-4 py-3 font-semibold text-slate-600">주소</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-center">점검 횟수</th>
                <th className="px-4 py-3 font-semibold text-slate-600">최근 서비스</th>
                <th className="px-4 py-3 font-semibold text-slate-600">재상담 예정</th>
                <th className="px-4 py-3 font-semibold text-slate-600">상담 기록</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">불러오는 중...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-400">고객 데이터가 없습니다.</td></tr>
              ) : customers.map((c) => (
                <tr key={c.phone} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-700">{c.phone}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{c.address ?? "-"}</td>
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
                  <td className="px-4 py-3 text-slate-600">{formatDate(c.lastServiceDate)}</td>
                  <td className="px-4 py-3">
                    {c.nextFollowUp ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        {formatDate(c.nextFollowUp)}
                      </span>
                    ) : <span className="text-slate-400 text-xs">없음</span>}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/crm/consultations?phone=${encodeURIComponent(c.phone)}&name=${encodeURIComponent(c.name)}`}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-700"
                    >
                      상담 기록 →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">총 {customers.length}명 · 예약·상담 기록 기반 자동 집계 (잠재고객 포함)</p>
    </main>
  );
}

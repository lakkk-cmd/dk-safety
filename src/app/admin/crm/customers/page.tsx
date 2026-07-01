"use client";

import { useEffect, useState, useCallback } from "react";
import type { CustomerSummary } from "@/lib/crm-db";

function formatDate(s: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("ko-KR");
}

export default function CrmCustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

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

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">CRM</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">고객 관리</h1>
        <p className="mt-1 text-sm text-slate-600">예약 이력 기반 고객 목록 · 재상담 일정 확인</p>
      </div>

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
                    <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                      {c.serviceCount}회
                    </span>
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

      <p className="mt-3 text-xs text-slate-400">총 {customers.length}명 · 예약 데이터 기반 자동 집계</p>
    </main>
  );
}

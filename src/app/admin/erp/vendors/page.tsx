"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import type { Vendor } from "@/lib/financial-ledger";

type VendorRow = Vendor & { totalSpend: number };

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("자재상");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/erp/vendors", { cache: "no-store" });
      const json = (await res.json()) as { vendors?: VendorRow[] };
      setVendors(json.vendors ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/erp/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, business_number: businessNumber || null, phone: phone || null, category })
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(json.error ?? "등록 실패");
        return;
      }
      setName("");
      setBusinessNumber("");
      setPhone("");
      void load();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (vendor: VendorRow) => {
    await fetch(`/api/admin/erp/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !vendor.active })
    });
    void load();
  };

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">매입/거래처 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          자재상·장비업체 등 매입 거래처를 등록해두면 경비관리 화면에서 거래처를 선택할 수 있고, 거래처별 누적 매입액이
          자동 집계됩니다.
        </p>
      </div>

      <form onSubmit={submit} className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="거래처명" required className="min-w-[160px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="자재상">자재상</option>
          <option value="장비업체">장비업체</option>
          <option value="기타">기타</option>
        </select>
        <input value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="사업자번호 (선택)" className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="연락처 (선택)" className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {submitting ? "등록 중..." : "등록"}
        </button>
      </form>
      {msg ? <p className="mb-3 text-xs text-rose-600">{msg}</p> : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <p className="py-8 text-center text-slate-400">불러오는 중...</p>
        ) : vendors.length === 0 ? (
          <p className="py-8 text-center text-slate-400">등록된 거래처가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">거래처명</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">분류</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">연락처</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">누적 매입액</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">상태</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{v.name}</td>
                    <td className="px-4 py-3 text-slate-600">{v.category ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{v.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{formatKRW(v.totalSpend)}</td>
                    <td className="px-4 py-3">{v.active ? "사용중" : "비활성"}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => void toggleActive(v)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold">
                        {v.active ? "비활성화" : "활성화"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type TrustedDomain = {
  id: string;
  category: string;
  domain: string;
  name: string;
  is_active: boolean;
  note: string | null;
};

const CATEGORIES = ["전기법령", "전기기술", "유튜브", "마케팅", "AI자동화", "사업경영", "기타일반"];

export default function TrustedDomainManager() {
  const [domains, setDomains] = useState<TrustedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: CATEGORIES[0], domain: "", name: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (category: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/trusted-domains${category ? `?category=${encodeURIComponent(category)}` : ""}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { data?: TrustedDomain[] };
      setDomains(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(categoryFilter); }, [load, categoryFilter]);

  const handleToggle = async (id: string, isActive: boolean) => {
    await fetch("/api/admin/trusted-domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive }),
    });
    void load(categoryFilter);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 도메인을 삭제할까요?")) return;
    await fetch(`/api/admin/trusted-domains?id=${id}`, { method: "DELETE" });
    void load(categoryFilter);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.domain.trim() || !form.name.trim()) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/trusted-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setMsg(`오류: ${data.error}`); return; }
      setForm({ category: form.category, domain: "", name: "", note: "" });
      setShowForm(false);
      void load(categoryFilter);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-900">신뢰 도메인 관리</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
        >
          {showForm ? "닫기" : "+ 도메인 추가"}
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        웹 학습(Tavily 검색)은 카테고리별 신뢰 도메인 목록에 등록된 출처만 사용합니다. 카테고리에 등록된 도메인이 없으면 모든 출처를 허용합니다.
      </p>

      {showForm ? (
        <form onSubmit={handleSubmit} className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={form.domain}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            placeholder="도메인 (예: kesco.or.kr)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="사이트명"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="메모 (선택)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {msg ? <p className="text-xs font-semibold text-red-600 sm:col-span-2">{msg}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 sm:col-span-2"
          >
            {submitting ? "등록 중..." : "등록"}
          </button>
        </form>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1">
        {["", ...CATEGORIES].map((c) => (
          <button
            key={c || "all"}
            type="button"
            onClick={() => setCategoryFilter(c)}
            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
              categoryFilter === c ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c || "전체"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">불러오는 중...</p>
        ) : domains.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">등록된 도메인이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold text-slate-500">
                <th className="px-4 py-2.5">카테고리</th>
                <th className="px-4 py-2.5">도메인</th>
                <th className="px-4 py-2.5">사이트명</th>
                <th className="px-4 py-2.5 text-center">상태</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{d.category}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{d.domain}</td>
                  <td className="px-4 py-2.5 text-slate-700">{d.name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => void handleToggle(d.id, d.is_active)}
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        d.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {d.is_active ? "활성" : "비활성"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => void handleDelete(d.id)} className="text-xs text-slate-400 hover:text-red-600">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

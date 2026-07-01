"use client";

import { useEffect, useState, useCallback } from "react";
import type { WorkerRow } from "@/lib/erp-db";

const SPECIALTIES = ["누전차단기", "분전반", "배선", "콘센트/스위치", "전등", "전기안전점검", "에어컨", "기타"];
const TYPE_LABEL = { employee: "직원", contractor: "외주" };

type WorkerForm = {
  name: string;
  phone: string;
  worker_type: "employee" | "contractor";
  specialty: string[];
  hourly_rate: string;
  daily_rate: string;
  worker_note: string;
  certifications: string;
};

const emptyForm = (): WorkerForm => ({
  name: "", phone: "", worker_type: "employee",
  specialty: [], hourly_rate: "", daily_rate: "",
  worker_note: "", certifications: "",
});

export default function ErpWorkersPage() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; worker?: WorkerRow } | null>(null);
  const [form, setForm] = useState<WorkerForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/erp/workers", { cache: "no-store" });
      const json = await res.json() as { workers: WorkerRow[] };
      setWorkers(json.workers ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm(emptyForm()); setModal({ mode: "create" }); setMsg(null); };
  const openEdit = (w: WorkerRow) => {
    setForm({
      name: w.name, phone: w.phone,
      worker_type: w.worker_type ?? "employee",
      specialty: w.specialty ?? [],
      hourly_rate: w.hourly_rate ? String(w.hourly_rate) : "",
      daily_rate: w.daily_rate ? String(w.daily_rate) : "",
      worker_note: w.worker_note ?? "",
      certifications: w.certifications ?? "",
    });
    setModal({ mode: "edit", worker: w });
    setMsg(null);
  };

  const toggleSpec = (s: string) => {
    setForm((f) => ({
      ...f,
      specialty: f.specialty.includes(s) ? f.specialty.filter((x) => x !== s) : [...f.specialty, s],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...form,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
      };
      if (modal?.mode === "edit" && modal.worker) {
        const res = await fetch(`/api/admin/erp/workers/${modal.worker.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch("/api/admin/erp/workers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setModal(null);
      void load();
    } catch (e) {
      setMsg("오류: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (w: WorkerRow) => {
    if (!confirm(`${w.name}을(를) 삭제하시겠습니까?`)) return;
    try {
      await fetch(`/api/admin/erp/workers/${w.id}`, { method: "DELETE" });
      void load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">ERP</p>
          <h1 className="mt-1 text-3xl font-black text-slate-900">작업자 관리</h1>
          <p className="mt-1 text-sm text-slate-600">직원/외주 인력 정보 · 단가 · 전문분야</p>
        </div>
        <button onClick={openCreate} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          + 작업자 추가
        </button>
      </div>

      {loading ? (
        <p className="text-center py-12 text-slate-500">불러오는 중...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workers.length === 0 ? (
            <p className="col-span-2 text-center py-12 text-slate-400">등록된 작업자가 없습니다.</p>
          ) : workers.map((w) => (
            <div key={w.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-lg">{w.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${w.worker_type === "contractor" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {TYPE_LABEL[w.worker_type ?? "employee"]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${w.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {w.active ? "재직" : "퇴직"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{w.phone}</p>
                  {w.certifications && <p className="text-xs text-slate-500 mt-1">📋 {w.certifications}</p>}
                  {(w.specialty ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(w.specialty ?? []).map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-4 text-xs text-slate-500">
                    {w.hourly_rate && <span>시급 {w.hourly_rate.toLocaleString()}원</span>}
                    {w.daily_rate && <span>일당 {w.daily_rate.toLocaleString()}원</span>}
                  </div>
                  {w.worker_note && <p className="mt-2 text-xs text-slate-500 line-clamp-2">{w.worker_note}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(w)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50">수정</button>
                  <button onClick={() => handleDelete(w)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-black text-slate-900">
              {modal.mode === "create" ? "작업자 추가" : "작업자 수정"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">이름 *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">연락처 *</label>
                  <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">유형</label>
                <select value={form.worker_type} onChange={(e) => setForm((f) => ({ ...f, worker_type: e.target.value as "employee" | "contractor" }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="employee">직원</option>
                  <option value="contractor">외주</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">전문 분야</label>
                <div className="flex flex-wrap gap-2">
                  {SPECIALTIES.map((s) => (
                    <button key={s} type="button" onClick={() => toggleSpec(s)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${form.specialty.includes(s) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">시급 (원)</label>
                  <input type="number" value={form.hourly_rate} onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">일당 (원)</label>
                  <input type="number" value={form.daily_rate} onChange={(e) => setForm((f) => ({ ...f, daily_rate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">자격증/인증</label>
                <input value={form.certifications} onChange={(e) => setForm((f) => ({ ...f, certifications: e.target.value }))}
                  placeholder="예: 전기기사, 전기공사기사"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">메모</label>
                <textarea value={form.worker_note} onChange={(e) => setForm((f) => ({ ...f, worker_note: e.target.value }))} rows={2}
                  className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {msg && <p className="text-xs font-semibold text-red-600">{msg}</p>}
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? "저장 중..." : "저장"}
              </button>
              <button onClick={() => setModal(null)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold hover:bg-slate-50">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

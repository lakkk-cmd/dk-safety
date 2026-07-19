"use client";

import { useEffect, useState, useCallback } from "react";
import type { ServiceItemAdminRow } from "@/lib/service-items-admin";

type ApartmentOption = { id: string; name: string };

const SERVICE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "VISIT", label: "VISIT · 기본 출장/점검" },
  { value: "DIAGNOSIS", label: "DIAGNOSIS · 정밀 안전진단" },
  { value: "LEAKAGE", label: "LEAKAGE · 누전 점검/보수" },
  { value: "OUTLET", label: "OUTLET · 콘센트/스위치 교체" },
  { value: "LIGHT", label: "LIGHT · 전등기구 교체" }
];

function serviceTypeLabel(value: string): string {
  return SERVICE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

type ItemForm = {
  service_type: string;
  name: string;
  description: string;
  apt_id: string;
  min_fee: string;
  max_fee: string;
  unit_price: string;
  surcharge_flag: boolean;
  bulk_discount_flag: boolean;
  bulk_threshold: string;
  bulk_discount_rate: string;
  deductible_flag: boolean;
  negotiation_flag: boolean;
  required_cert: string;
  display_order: string;
  is_active: boolean;
};

const emptyForm = (): ItemForm => ({
  service_type: "VISIT",
  name: "",
  description: "",
  apt_id: "",
  min_fee: "",
  max_fee: "",
  unit_price: "",
  surcharge_flag: false,
  bulk_discount_flag: false,
  bulk_threshold: "5",
  bulk_discount_rate: "0",
  deductible_flag: false,
  negotiation_flag: false,
  required_cert: "",
  display_order: "0",
  is_active: true
});

function formToRow(form: ItemForm) {
  return {
    service_type: form.service_type,
    name: form.name.trim(),
    description: form.description.trim() || null,
    apt_id: form.apt_id || null,
    min_fee: form.min_fee === "" ? null : Number(form.min_fee),
    max_fee: form.max_fee === "" ? null : Number(form.max_fee),
    unit_price: form.unit_price === "" ? null : Number(form.unit_price),
    surcharge_flag: form.surcharge_flag,
    bulk_discount_flag: form.bulk_discount_flag,
    bulk_threshold: Number(form.bulk_threshold || 5),
    bulk_discount_rate: Number(form.bulk_discount_rate || 0),
    deductible_flag: form.deductible_flag,
    negotiation_flag: form.negotiation_flag,
    required_cert: form.required_cert.trim() || null,
    display_order: Number(form.display_order || 0),
    is_active: form.is_active
  };
}

/**
 * 2026-07-19: 최종 정산 계산식(calculate_final_fee, src/lib/daekyung-fee-logic.ts)이 실제로
 * 참조하는 service_items 테이블 — 지금까지 이걸 편집하는 관리자 화면이 아예 없어서 DB에 직접
 * 값을 넣어야만 바뀌었다. /admin/pricing 4번째 탭으로 신설.
 */
export default function AdminServiceItemPanel({ apartments }: { apartments: ApartmentOption[] }) {
  const [items, setItems] = useState<ServiceItemAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: ServiceItemAdminRow } | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const apartmentById = new Map(apartments.map((a) => [a.id, a.name]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/service-items", { cache: "no-store" });
      const json = (await res.json()) as { items?: ServiceItemAdminRow[] };
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm());
    setModal({ mode: "create" });
    setMsg(null);
  };

  const openEdit = (item: ServiceItemAdminRow) => {
    setForm({
      service_type: item.service_type,
      name: item.name,
      description: item.description ?? "",
      apt_id: item.apt_id ?? "",
      min_fee: item.min_fee != null ? String(item.min_fee) : "",
      max_fee: item.max_fee != null ? String(item.max_fee) : "",
      unit_price: item.unit_price != null ? String(item.unit_price) : "",
      surcharge_flag: item.surcharge_flag,
      bulk_discount_flag: item.bulk_discount_flag,
      bulk_threshold: String(item.bulk_threshold ?? 5),
      bulk_discount_rate: String(item.bulk_discount_rate ?? 0),
      deductible_flag: item.deductible_flag,
      negotiation_flag: item.negotiation_flag,
      required_cert: item.required_cert ?? "",
      display_order: String(item.display_order ?? 0),
      is_active: item.is_active
    });
    setModal({ mode: "edit", item });
    setMsg(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMsg("이름을 입력하세요.");
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = formToRow(form);
      if (modal?.mode === "edit" && modal.item) {
        const res = await fetch(`/api/admin/service-items/${modal.item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "수정 실패");
      } else {
        const res = await fetch("/api/admin/service-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "생성 실패");
      }
      setModal(null);
      void load();
    } catch (e) {
      setMsg("오류: " + (e instanceof Error ? e.message : "알 수 없는 오류"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ServiceItemAdminRow) => {
    if (!confirm(`"${item.name}" 항목을 삭제하시겠습니까? 이 요금 기준으로 이미 완료된 작업의 정산 내역에는 영향을 주지 않습니다.`)) return;
    try {
      const res = await fetch(`/api/admin/service-items/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "삭제 실패");
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">최종 정산 계산식 — 서비스별 요금 기준</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            기사가 현장 작업을 완료 처리할 때 여기 설정된 최소/최대금액·할증·묶음할인·출장비 공제 기준으로 최종 정산액이
            자동 계산됩니다.
          </p>
        </div>
        <button onClick={openCreate} className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
          + 항목 추가
        </button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-500">불러오는 중...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.length === 0 ? (
            <p className="col-span-2 py-12 text-center text-slate-400">등록된 서비스 항목이 없습니다.</p>
          ) : items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-slate-900 dark:text-slate-100">{item.name}</span>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      {serviceTypeLabel(item.service_type)}
                    </span>
                    {!item.is_active ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">비활성</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {item.apt_id ? (apartmentById.get(item.apt_id) ?? "알 수 없는 단지") : "전체 단지 공통"}
                  </p>
                  {item.description ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
                    {item.min_fee != null || item.max_fee != null ? (
                      <span>
                        {item.min_fee?.toLocaleString() ?? "-"} ~ {item.max_fee?.toLocaleString() ?? "-"}원
                      </span>
                    ) : (
                      <span className="text-slate-400">금액 미고정</span>
                    )}
                    {item.unit_price ? <span>단가 {item.unit_price.toLocaleString()}원</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.surcharge_flag ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">범위초과 허용</span> : null}
                    {item.bulk_discount_flag ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        {item.bulk_threshold}개↑ {item.bulk_discount_rate}%할인
                      </span>
                    ) : null}
                    {item.deductible_flag ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">출장비 공제</span> : null}
                    {item.negotiation_flag ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">협의 필요(참고용)</span> : null}
                    {item.required_cert ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">자격증: {item.required_cert}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => openEdit(item)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">수정</button>
                  <button onClick={() => handleDelete(item)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40">삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-4 text-lg font-black text-slate-900 dark:text-slate-100">
              {modal.mode === "create" ? "서비스 항목 추가" : "서비스 항목 수정"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">서비스 유형 *</label>
                  <select
                    value={form.service_type}
                    onChange={(e) => setForm((f) => ({ ...f, service_type: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
                  >
                    {SERVICE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">적용 단지</label>
                  <select
                    value={form.apt_id}
                    onChange={(e) => setForm((f) => ({ ...f, apt_id: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950"
                  >
                    <option value="">전체 단지 공통</option>
                    {apartments.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">이름 *</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">설명</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">최소금액</label>
                  <input type="number" value={form.min_fee} onChange={(e) => setForm((f) => ({ ...f, min_fee: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">최대금액</label>
                  <input type="number" value={form.max_fee} onChange={(e) => setForm((f) => ({ ...f, max_fee: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">단가(수량×단가)</label>
                  <input type="number" value={form.unit_price} onChange={(e) => setForm((f) => ({ ...f, unit_price: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.surcharge_flag} onChange={(e) => setForm((f) => ({ ...f, surcharge_flag: e.target.checked }))} />
                허용범위(최대금액) 초과 추가요금 허용
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.bulk_discount_flag} onChange={(e) => setForm((f) => ({ ...f, bulk_discount_flag: e.target.checked }))} />
                묶음 할인 사용
              </label>
              {form.bulk_discount_flag ? (
                <div className="ml-6 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">기준 수량(개)</label>
                    <input type="number" value={form.bulk_threshold} onChange={(e) => setForm((f) => ({ ...f, bulk_threshold: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">할인율(%)</label>
                    <input type="number" value={form.bulk_discount_rate} onChange={(e) => setForm((f) => ({ ...f, bulk_discount_rate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                  </div>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.deductible_flag} onChange={(e) => setForm((f) => ({ ...f, deductible_flag: e.target.checked }))} />
                작업 진행 시 기본 출장비를 최종금액에서 공제
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.negotiation_flag} onChange={(e) => setForm((f) => ({ ...f, negotiation_flag: e.target.checked }))} />
                협의 필요 표시 (참고용 — 요금 계산에는 영향 없음)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">필요 자격증</label>
                  <input value={form.required_cert} onChange={(e) => setForm((f) => ({ ...f, required_cert: e.target.value }))}
                    placeholder="예: 전기공사기사"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">표시 순서</label>
                  <input type="number" value={form.display_order} onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                사용함
              </label>

              {msg && <p className="text-xs font-semibold text-red-600">{msg}</p>}
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? "저장 중..." : "저장"}
              </button>
              <button onClick={() => setModal(null)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

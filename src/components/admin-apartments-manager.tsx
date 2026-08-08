"use client";

import { useEffect, useMemo, useState } from "react";

type Apartment = {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
  baseFee: number;
  district: string;
  address: string;
};

/** 광주 5개 구 — 관리자 목록 탭 분류/생성 폼 선택지 */
const DISTRICTS = ["동구", "서구", "남구", "북구", "광산구", "기타"] as const;
const UNASSIGNED_DISTRICT = "미분류";

const initialForm = {
  name: "",
  code: "",
  logoUrl: "",
  bankName: "기업은행",
  accountNumber: "188-146874-01-015",
  accountHolder: "대경이엔피",
  baseFee: 150000,
  district: "",
  address: ""
};

export default function AdminApartmentsManager() {
  const [items, setItems] = useState<Apartment[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [formMessage, setFormMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [districtTab, setDistrictTab] = useState("전체");
  const [search, setSearch] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/apartments", { cache: "no-store" });
    const data = (await response.json()) as { apartments?: Apartment[]; message?: string };
    if (!response.ok) {
      setMessage(data.message ?? "아파트 목록 조회 실패");
      return;
    }
    setItems(data.apartments ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const saveItem = async () => {
    const isEdit = Boolean(editingId);
    if (!form.name.trim() || !form.code.trim()) {
      setFormMessage({ type: "error", text: "아파트명과 코드를 모두 입력해주세요." });
      return;
    }
    const response = await fetch(isEdit ? `/api/admin/apartments/${editingId}` : "/api/admin/apartments", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        code: form.code,
        logoUrl: form.logoUrl,
        bankInfo: { bankName: form.bankName, accountNumber: form.accountNumber, accountHolder: form.accountHolder || form.name },
        baseFee: form.baseFee,
        district: form.district,
        address: form.address
      })
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setFormMessage({ type: "error", text: data.message ?? "생성 실패" });
      return;
    }
    setForm(initialForm);
    setEditingId(null);
    setFormMessage({ type: "success", text: isEdit ? "아파트가 수정되었습니다." : "아파트가 생성되었습니다." });
    await load();
  };

  const removeItem = async (id: string) => {
    const response = await fetch(`/api/admin/apartments/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("삭제 실패");
      return;
    }
    await load();
  };

  const districtLabel = (d: string) => d || UNASSIGNED_DISTRICT;

  const tabCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const label = districtLabel(item.district);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const tabs = useMemo(() => {
    const present = [...DISTRICTS, UNASSIGNED_DISTRICT].filter((d) => tabCounts.has(d));
    return ["전체", ...present];
  }, [tabCounts]);

  const filteredItems = useMemo(() => {
    const q = search.trim();
    return items.filter((item) => {
      const matchesTab = districtTab === "전체" || districtLabel(item.district) === districtTab;
      const matchesSearch = !q || item.name.includes(q) || item.code.includes(q.toLowerCase()) || item.address.includes(q);
      return matchesTab && matchesSearch;
    });
  }, [items, districtTab, search]);

  return (
    <section className="space-y-4">
      <div className="surface-card rounded-2xl p-4">
        <p className="warranty-badge">APT CONFIG</p>
        <h2 className="text-lg font-bold">{editingId ? "아파트 수정" : "아파트 생성"}</h2>
        <p className="mt-1 text-xs text-slate-600">생성 후 전용 경로: /apt/[code]</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="아파트명 (필수)" className="soft-input" />
          <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toLowerCase() }))} placeholder="코드 (필수, 예: moonheung)" className="soft-input" />
          <select value={form.district} onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))} className="soft-input md:col-span-2">
            <option value="">구 미지정</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder="주소 (도로명 또는 지번)"
            className="soft-input md:col-span-2"
          />
          <input value={form.logoUrl} onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="로고 URL" className="soft-input md:col-span-2" />
          <input value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="은행명" className="soft-input" />
          <input value={form.accountNumber} onChange={(e) => setForm((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="계좌번호" className="soft-input" />
          <input value={form.accountHolder} onChange={(e) => setForm((p) => ({ ...p, accountHolder: e.target.value }))} placeholder="예금주" className="soft-input" />
          <input
            type="number"
            value={form.baseFee}
            onChange={(e) => setForm((p) => ({ ...p, baseFee: Number(e.target.value || 0) }))}
            placeholder="기본 출장비"
            className="soft-input"
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => void saveItem()} className="btn-primary px-4 py-2 text-sm">
            {editingId ? "수정 저장" : "아파트 생성"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(initialForm);
              }}
              className="btn-outline px-4 py-2 text-sm"
            >
              취소
            </button>
          ) : null}
        </div>
        {formMessage ? (
          <p className={`mt-2 text-sm font-semibold ${formMessage.type === "error" ? "text-rose-600" : "text-emerald-600"}`}>
            {formMessage.text}
          </p>
        ) : null}
      </div>

      <div className="surface-card rounded-2xl p-4">
        <p className="warranty-badge">APT LIST</p>
        <h3 className="text-base font-bold">아파트 목록</h3>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setDistrictTab(tab)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                districtTab === tab
                  ? "border-dk-navy bg-dk-navy text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab} {tab === "전체" ? `(${items.length})` : `(${tabCounts.get(tab) ?? 0})`}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="아파트명 또는 코드로 검색"
          className="soft-input mt-2 w-full"
        />

        <ul className="mt-3 space-y-2">
          {filteredItems.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
              조건에 맞는 아파트가 없습니다.
            </li>
          ) : null}
          {filteredItems.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-900">
                {item.name} <span className="text-xs text-slate-500">/apt/{item.code}</span>{" "}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{districtLabel(item.district)}</span>
              </p>
              {item.address ? <p className="mt-0.5 text-xs text-slate-500">{item.address}</p> : null}
              <p className="mt-1 text-xs text-slate-600">
                {item.bankInfo.bankName} {item.bankInfo.accountNumber} ({item.bankInfo.accountHolder}) · 기본 {item.baseFee.toLocaleString("ko-KR")}원
              </p>
              <button type="button" onClick={() => void removeItem(item.id)} className="mt-2 rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700">
                삭제
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(item.id);
                  setForm({
                    name: item.name,
                    code: item.code,
                    logoUrl: item.logoUrl ?? "",
                    bankName: item.bankInfo.bankName,
                    accountNumber: item.bankInfo.accountNumber,
                    accountHolder: item.bankInfo.accountHolder,
                    baseFee: item.baseFee,
                    district: item.district,
                    address: item.address
                  });
                }}
                className="ml-2 mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                수정
              </button>
            </li>
          ))}
        </ul>
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
      </div>
    </section>
  );
}

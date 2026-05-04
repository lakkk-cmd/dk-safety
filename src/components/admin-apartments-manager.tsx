"use client";

import { useEffect, useState } from "react";

type Apartment = {
  id: string;
  name: string;
  code: string;
  logoUrl: string | null;
  bankInfo: { bankName: string; accountNumber: string; accountHolder: string };
  baseFee: number;
};

const initialForm = {
  name: "",
  code: "",
  logoUrl: "",
  bankName: "국민은행",
  accountNumber: "",
  accountHolder: "",
  baseFee: 50000
};

export default function AdminApartmentsManager() {
  const [items, setItems] = useState<Apartment[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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
    const response = await fetch(isEdit ? `/api/admin/apartments/${editingId}` : "/api/admin/apartments", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        code: form.code,
        logoUrl: form.logoUrl,
        bankInfo: { bankName: form.bankName, accountNumber: form.accountNumber, accountHolder: form.accountHolder || form.name },
        baseFee: form.baseFee
      })
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(data.message ?? "생성 실패");
      return;
    }
    setForm(initialForm);
    setEditingId(null);
    setMessage(isEdit ? "아파트가 수정되었습니다." : "아파트가 생성되었습니다.");
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

  return (
    <section className="space-y-4">
      <div className="surface-card rounded-2xl p-4">
        <p className="warranty-badge">APT CONFIG</p>
        <h2 className="text-lg font-bold">{editingId ? "아파트 수정" : "아파트 생성"}</h2>
        <p className="mt-1 text-xs text-slate-600">생성 후 전용 경로: /apt/[code]</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="아파트명" className="soft-input" />
          <input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toLowerCase() }))} placeholder="코드 (예: moonheung)" className="soft-input" />
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
      </div>

      <div className="surface-card rounded-2xl p-4">
        <p className="warranty-badge">APT LIST</p>
        <h3 className="text-base font-bold">아파트 목록</h3>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-900">
                {item.name} <span className="text-xs text-slate-500">/apt/{item.code}</span>
              </p>
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
                    baseFee: item.baseFee
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

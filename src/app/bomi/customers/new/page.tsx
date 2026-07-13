"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewBomiCustomerPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    birthDate: "",
    gender: "",
    occupation: "",
    familyNote: "",
    financialNote: "",
    memo: ""
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/bomi/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await response.json()) as { customer?: { id: string }; message?: string };
      if (!response.ok || !data.customer) {
        throw new Error(data.message || "등록 실패");
      }
      router.push(`/bomi/customers/${data.customer.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "등록 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-6">
      <form onSubmit={onSubmit} className="surface-card mx-auto max-w-xl rounded-2xl p-6">
        <p className="section-kicker">고객카드</p>
        <h1 className="mt-3 text-xl font-bold text-slate-950">새 고객 등록</h1>

        <label className="mt-4 block text-sm font-semibold text-slate-700">이름 *</label>
        <input required value={form.name} onChange={update("name")} className="soft-input mt-1 w-full" />

        <label className="mt-4 block text-sm font-semibold text-slate-700">연락처</label>
        <input value={form.phone} onChange={update("phone")} placeholder="010-0000-0000" className="soft-input mt-1 w-full" />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700">생년월일</label>
            <input type="date" value={form.birthDate} onChange={update("birthDate")} className="soft-input mt-1 w-full" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">성별</label>
            <select value={form.gender} onChange={update("gender")} className="soft-input mt-1 w-full">
              <option value="">선택 안 함</option>
              <option value="남">남</option>
              <option value="여">여</option>
            </select>
          </div>
        </div>

        <label className="mt-4 block text-sm font-semibold text-slate-700">직업</label>
        <input value={form.occupation} onChange={update("occupation")} className="soft-input mt-1 w-full" />

        <label className="mt-4 block text-sm font-semibold text-slate-700">가족사항</label>
        <textarea value={form.familyNote} onChange={update("familyNote")} rows={2} className="soft-input mt-1 w-full" />

        <label className="mt-4 block text-sm font-semibold text-slate-700">재무정보</label>
        <textarea value={form.financialNote} onChange={update("financialNote")} rows={2} className="soft-input mt-1 w-full" />

        <label className="mt-4 block text-sm font-semibold text-slate-700">메모</label>
        <textarea value={form.memo} onChange={update("memo")} rows={2} className="soft-input mt-1 w-full" />

        <button type="submit" disabled={loading} className="btn-primary mt-6 w-full px-4 py-3 text-sm disabled:opacity-60">
          {loading ? "등록 중..." : "등록"}
        </button>
        {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
      </form>
    </div>
  );
}

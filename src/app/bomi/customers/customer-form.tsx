"use client";

import { FormEvent, useState } from "react";

export type CustomerFormValues = {
  name: string;
  phone: string;
  address: string;
  birthDate: string;
  gender: string;
  occupation: string;
  familyNote: string;
  financialNote: string;
  memo: string;
};

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  name: "",
  phone: "",
  address: "",
  birthDate: "",
  gender: "",
  occupation: "",
  familyNote: "",
  financialNote: "",
  memo: ""
};

export default function CustomerForm({
  initial,
  onSubmit,
  submitLabel,
  submittingLabel,
  kicker,
  title
}: {
  initial: CustomerFormValues;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
  submitLabel: string;
  submittingLabel: string;
  kicker: string;
  title: string;
}) {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const update =
    (key: keyof CustomerFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await onSubmit(form);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="surface-card mx-auto max-w-xl rounded-2xl p-6">
      <p className="section-kicker">{kicker}</p>
      <h1 className="mt-3 text-xl font-bold text-slate-950">{title}</h1>

      <label className="mt-4 block text-sm font-semibold text-slate-700">이름 *</label>
      <input required value={form.name} onChange={update("name")} className="soft-input mt-1 w-full" />

      <label className="mt-4 block text-sm font-semibold text-slate-700">연락처</label>
      <input value={form.phone} onChange={update("phone")} placeholder="010-0000-0000" className="soft-input mt-1 w-full" />

      <label className="mt-4 block text-sm font-semibold text-slate-700">주소</label>
      <input
        value={form.address}
        onChange={update("address")}
        placeholder="예: 광주광역시 서구 상무대로 000"
        className="soft-input mt-1 w-full"
      />

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
        {loading ? submittingLabel : submitLabel}
      </button>
      {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
    </form>
  );
}

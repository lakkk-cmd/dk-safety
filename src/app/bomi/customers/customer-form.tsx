"use client";

import { FormEvent, useState } from "react";

export type CustomerFormValues = {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
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
  postalCode: "",
  birthDate: "",
  gender: "",
  occupation: "",
  familyNote: "",
  financialNote: "",
  memo: ""
};

// 다음(카카오) 우편번호 서비스 — 무료, API 키 불필요. 검색 버튼을 눌렀을 때만 로드한다.
const DAUM_POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

type DaumPostcodeResult = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  address: string;
};

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeResult) => void }) => { open: () => void };
    };
  }
}

function loadDaumPostcodeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.daum?.Postcode) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAUM_POSTCODE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("주소 검색 스크립트를 불러오지 못했습니다.")));
      return;
    }
    const script = document.createElement("script");
    script.src = DAUM_POSTCODE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("주소 검색 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

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
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);

  const update =
    (key: keyof CustomerFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const openAddressSearch = async () => {
    setAddressSearchLoading(true);
    setMessage("");
    try {
      await loadDaumPostcodeScript();
      new window.daum!.Postcode({
        oncomplete: (data) => {
          setForm((prev) => ({
            ...prev,
            postalCode: data.zonecode,
            address: data.roadAddress || data.jibunAddress || data.address
          }));
        }
      }).open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "주소 검색을 열 수 없습니다.");
    } finally {
      setAddressSearchLoading(false);
    }
  };

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
      <div className="mt-1 flex gap-2">
        <input
          value={form.postalCode}
          readOnly
          placeholder="우편번호"
          className="soft-input w-28 bg-slate-50 text-slate-500"
        />
        <button
          type="button"
          onClick={openAddressSearch}
          disabled={addressSearchLoading}
          className="btn-outline whitespace-nowrap px-3 text-sm disabled:opacity-60"
        >
          {addressSearchLoading ? "여는 중..." : "주소 검색"}
        </button>
      </div>
      <input
        value={form.address}
        onChange={update("address")}
        placeholder="주소 검색 버튼을 누르면 자동으로 채워집니다 (상세주소는 이어서 입력)"
        className="soft-input mt-2 w-full"
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

"use client";

import { FormEvent, useState } from "react";

export default function AdminWorkerRegister() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, pin })
      });
      const data = (await response.json()) as { message?: string; reissued?: boolean };
      if (!response.ok) {
        setMessage(data.message ?? "등록에 실패했습니다.");
        return;
      }
      setMessage(data.reissued ? "이미 등록된 연락처라 PIN을 재발급했습니다." : "기사가 등록되었습니다.");
      setName("");
      setPhone("");
      setPin("");
      window.dispatchEvent(new CustomEvent("dk-admin-workers-refresh"));
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="surface-card rounded-2xl border border-slate-200 p-5">
      <p className="text-xs font-semibold text-indigo-700">Supabase DB</p>
      <h2 className="mt-1 text-lg font-black text-slate-950">기사 등록 / PIN 재발급</h2>
      <p className="mt-1 text-xs text-slate-600">
        현장 앱(/worker) 로그인에 사용할 연락처와 PIN을 등록합니다. 이미 등록된 연락처(예: 작업자관리에서
        먼저 추가한 기사)를 입력하면 새로 만들지 않고 그 사람의 PIN을 재발급합니다.
      </p>
      <form className="mt-4 space-y-2" onSubmit={submit}>
        <input className="soft-input w-full text-sm" placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} required />
        <input
          className="soft-input w-full text-sm"
          placeholder="연락처 (예: 010-1234-5678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          required
        />
        <input
          className="soft-input w-full text-sm"
          placeholder="PIN (4~12자리)"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          inputMode="numeric"
          required
        />
        {message ? <p className="text-xs text-slate-700">{message}</p> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2 text-sm disabled:opacity-60">
          {loading ? "등록 중..." : "기사 추가"}
        </button>
      </form>
    </section>
  );
}

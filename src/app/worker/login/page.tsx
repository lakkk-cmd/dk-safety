"use client";

import { FormEvent, Suspense, useState } from "react";
import WorkerLoginNotice from "@/components/worker/worker-login-notice";

function WorkerLoginForm() {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/worker/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "로그인에 실패했습니다.");
        return;
      }
      window.location.href = "/worker";
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      <p className="text-xs font-semibold text-blue-700">대경안심전기</p>
      <h1 className="mt-2 text-2xl font-black text-slate-950">기사 로그인</h1>
      <p className="mt-2 text-sm text-slate-600">관리자가 등록한 연락처와 PIN으로 로그인합니다.</p>
      <Suspense fallback={null}>
        <WorkerLoginNotice />
      </Suspense>

      <form className="mt-6 space-y-3" onSubmit={submit}>
          <input
            className="soft-input w-full"
            placeholder="연락처 (예: 010-1234-5678)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            required
          />
          <input
            className="soft-input w-full"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            required
          />
          {message ? <p className="text-sm text-rose-700">{message}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm disabled:opacity-60">
            {loading ? "확인 중..." : "로그인"}
          </button>
      </form>
    </div>
  );
}

export default function WorkerLoginPage() {
  return (
    <main className="page-fit flex max-w-md flex-col justify-center bg-slate-100">
      <WorkerLoginForm />
    </main>
  );
}

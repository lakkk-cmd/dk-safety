"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function BomiLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/bomi/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = (await response.json()) as { message: string };
      if (!response.ok) {
        throw new Error(data.message || "로그인 실패");
      }

      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/bomi");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-fit flex min-h-screen max-w-md items-center">
      <form onSubmit={onSubmit} className="surface-card-strong w-full rounded-2xl p-6">
        <p className="section-kicker">보미 · 보험설계사 CRM</p>
        <h1 className="mt-3 text-2xl font-bold">보미 로그인</h1>
        <p className="mt-2 text-sm text-slate-600">dk-safety 전기안전 사업과는 별개의 서비스입니다.</p>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="soft-input mt-4 w-full"
        />
        <button type="submit" disabled={loading} className="btn-primary mt-4 w-full px-4 py-3 text-sm disabled:opacity-60">
          {loading ? "로그인 중..." : "로그인"}
        </button>
        {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
      </form>
    </main>
  );
}

export default function BomiLoginPage() {
  return (
    <Suspense fallback={null}>
      <BomiLoginForm />
    </Suspense>
  );
}

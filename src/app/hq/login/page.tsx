"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function HqLoginForm() {
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
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });

      const data = (await response.json()) as { message: string };
      if (!response.ok) {
        throw new Error(data.message || "로그인 실패");
      }

      const next = searchParams.get("next");
      if (next && /^https?:\/\//.test(next)) {
        window.location.href = next;
        return;
      }
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-5">
      <div className="surface-editorial rounded-[2rem] p-7">
        <p className="section-kicker">HQ 콘솔</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">경영진 사령부 로그인</h1>
        <p className="mt-2 text-sm text-slate-600">
          관리자 비밀번호로 로그인하면 hq·report 서브도메인을 모두 이용할 수 있습니다.
        </p>
      </div>
      <form onSubmit={onSubmit} className="surface-card-strong w-full rounded-2xl p-6">
        <p className="text-sm font-semibold text-primary">우리집 전기주치의(대경이엔피) HQ</p>
        <h2 className="mt-1 text-2xl font-bold">관리자 로그인</h2>
        <p className="mt-2 text-sm text-slate-600">설정된 관리자 비밀번호를 입력해주세요.</p>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="관리자 비밀번호"
          className="soft-input mt-4 w-full"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primary mt-4 w-full px-4 py-3 text-sm disabled:opacity-60"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
        {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
      </form>
    </div>
  );
}

export default function HqLoginPage() {
  return (
    <Suspense fallback={null}>
      <HqLoginForm />
    </Suspense>
  );
}

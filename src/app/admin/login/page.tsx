"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
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
        body: JSON.stringify({ phone, password })
      });

      const data = (await response.json()) as { message: string };
      if (!response.ok) {
        throw new Error(data.message || "로그인 실패");
      }

      router.replace("/admin/home");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-fit flex max-w-4xl items-center">
      <div className="w-full space-y-5">
        <div className="surface-editorial rounded-[2rem] p-7">
          <p className="section-kicker">관리자 콘솔</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">관리자 보안 로그인</h1>
          <p className="mt-2 text-sm text-slate-600">예약/자가진단/백업 관리 기능은 관리자 인증 후 접근할 수 있습니다.</p>
        </div>
        <form onSubmit={onSubmit} className="surface-card-strong w-full rounded-2xl p-6">
          <p className="text-sm font-semibold text-primary">우리집 전기주치의(대경이엔피) 관리자</p>
          <h2 className="mt-1 text-2xl font-bold">관리자 로그인</h2>
          <p className="mt-2 text-sm text-slate-600">
            본인 계정의 연락처와 비밀번호를 입력하세요. 계정이 없다면 연락처는 비워두고 관리자 마스터 비밀번호로
            로그인할 수 있습니다.
          </p>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="연락처 (계정이 없으면 비워두세요)"
            className="soft-input mt-4 w-full"
          />
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
    </main>
  );
}

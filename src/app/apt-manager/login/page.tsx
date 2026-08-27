"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { APT_MANAGER_APK_URL } from "@/lib/mobile-apps";

export default function AptManagerLoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/apt-manager/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password })
      });
      const data = (await response.json()) as { status?: "pending" | "approved"; message?: string };
      if (!response.ok) {
        setMessage(data.message ?? "로그인에 실패했습니다.");
        return;
      }
      if (data.status === "pending") {
        window.location.href = "/apt-manager/pending";
        return;
      }
      window.location.href = "/apt-manager";
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-fit flex max-w-md flex-col justify-center bg-slate-100">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        <p className="text-xs font-semibold text-dk-blue">우리집 안심전기(대경이엔피)</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">공동주택 세대 전기설비점검 로그인</h1>
        <p className="mt-2 text-sm text-slate-600">단지 전기안전관리자 전용 계정으로 로그인합니다.</p>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <input
            className="soft-input w-full"
            placeholder="아이디"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            className="soft-input w-full"
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {message ? <p className="text-sm text-rose-700">{message}</p> : null}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm disabled:opacity-60">
            {loading ? "확인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          아직 계정이 없으신가요?{" "}
          <Link href="/apt-manager/signup" className="font-bold text-dk-blue">
            가입 신청
          </Link>
        </p>

        {APT_MANAGER_APK_URL ? (
          <p className="mt-3 text-center text-xs text-slate-400">
            <a href={APT_MANAGER_APK_URL} className="underline">
              📱 안드로이드 앱 다운로드(APK)
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}

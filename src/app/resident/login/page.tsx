import ResidentLoginForm from "@/components/resident/resident-login-form";
import Link from "next/link";
import { Suspense } from "react";

export default function ResidentLoginPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <div className="surface-editorial mb-6 rounded-[2rem] p-7 md:p-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">입주민 로그인</p>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.03em] text-slate-950 md:text-5xl">입주민 전용 로그인</h1>
            <p className="mt-3 max-w-2xl text-base text-slate-600">
              로그인 후 15문항으로 집안 전기 상태를 간편 점검하고, 기록까지 안전하게 저장할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/home" className="btn-outline px-4 py-2 text-sm">
              서비스 홈
            </Link>
            <Link href="/reservation" className="btn-primary px-4 py-2 text-sm">
              점검 예약
            </Link>
          </div>
        </div>
      </div>
      <Suspense fallback={<div className="surface-card rounded-2xl p-6 text-sm text-slate-600">로그인 폼을 불러오는 중...</div>}>
        <ResidentLoginForm />
      </Suspense>
    </main>
  );
}

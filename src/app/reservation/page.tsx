import Link from "next/link";
import { Suspense } from "react";
import ReservationForm from "@/components/reservation-form";
import PageNavButtons from "@/components/page-nav-buttons";

export default function ReservationPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <PageNavButtons />
      <div className="surface-editorial mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">예약 접수 센터</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">전기 점검 예약 접수</h1>
            <p className="mt-2 text-sm text-slate-600">증상과 희망 일정을 남기면 접수 후 담당 기술자가 빠르게 연락드립니다.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/resident/safety-check" className="btn-outline px-4 py-2 text-sm">
              자가진단
            </Link>
            <Link href="/home" className="btn-outline px-4 py-2 text-sm">
              홈으로
            </Link>
          </div>
        </div>
      </div>
      <Suspense fallback={<div className="surface-card rounded-2xl p-6 text-sm text-slate-600">예약 폼을 불러오는 중...</div>}>
        <ReservationForm />
      </Suspense>
    </main>
  );
}

import ResidentSessionBar from "@/components/resident/resident-session-bar";
import SafetyDiagnosisForm from "@/components/resident/safety-diagnosis-form";
import PageNavButtons from "@/components/page-nav-buttons";
import Link from "next/link";

export default function ResidentSafetyCheckPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:py-14">
      <PageNavButtons />
      <section className="surface-editorial mb-5 rounded-[1.75rem] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-kicker">전기 안전 자가진단</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950">입주민 전기 안전 자가진단</h1>
            <p className="mt-2 text-sm text-slate-600">15문항 점검 후 결과를 저장하고, 필요한 경우 바로 점검 예약까지 연결됩니다.</p>
          </div>
          <Link href="/reservation" className="btn-primary w-fit px-4 py-2 text-sm">
            위험 시 점검 예약
          </Link>
        </div>
      </section>
      <ResidentSessionBar />
      <SafetyDiagnosisForm />
    </main>
  );
}

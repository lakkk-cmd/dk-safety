import Link from "next/link";
import ResidentSessionBar from "@/components/resident/resident-session-bar";
import ResidentHistoryPanel from "@/components/resident/history/resident-history-panel";
import PageNavButtons from "@/components/page-nav-buttons";

export default function ResidentHistoryPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:py-14">
      <PageNavButtons />
      <section className="surface-editorial mb-5 rounded-[1.75rem] p-6">
        <p className="section-kicker">자가진단 이력</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950">자가진단 결과 이력</h1>
        <p className="mt-2 text-sm text-slate-600">누적 결과를 확인하고 점검 필요 시 바로 재진단 또는 예약으로 이동할 수 있습니다.</p>
      </section>
      <ResidentSessionBar />
      <div className="mb-5 flex justify-end">
        <Link href="/resident/safety-check" className="btn-outline px-3 py-2 text-sm">
          자가진단 다시하기
        </Link>
      </div>
      <ResidentHistoryPanel />
    </main>
  );
}

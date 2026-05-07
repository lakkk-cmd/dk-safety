import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminWorkflowFlow from "@/components/admin/admin-workflow-flow";

export const dynamic = "force-dynamic";

export default function AdminWorkflowPage() {
  return (
    <main className="page-fit mx-auto max-w-6xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="warranty-badge">ADMIN CONSOLE</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">업무 진행 흐름</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-700">
              <strong className="font-bold text-slate-900">실제 업무가 진행되는 순서</strong>입니다. 단지 기준 → 예약·입금 → 기사 준비·배정 → 현장 정산·보증서·통계까지 한 화면에서 단계별로 이동할 수
              있습니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/home"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
              >
                메인화면으로
              </Link>
              <Link
                href="/worker/login"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
              >
                기사 현장 페이지
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <AdminWorkflowFlow />
    </main>
  );
}

import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminProcessGuide from "@/components/admin/admin-process-guide";

export const dynamic = "force-dynamic";

export default function AdminProcessGuidePage() {
  return (
    <main className="page-fit mx-auto max-w-6xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8 print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="warranty-badge">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">업무 흐름 안내서 (인쇄용)</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-700">
              <strong className="font-bold text-slate-900">사용자 앱 · 관리자 화면 · 기사 앱</strong>이 초기 접수부터 디지털
              보증서 발급까지 어떤 순서로 이어지는지 한 문서로 정리했습니다. 인쇄하거나 PDF로 저장해 보관·공유할 수 있습니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/workflow"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
              >
                업무 진행 흐름(화면 이동)으로
              </Link>
              <Link
                href="/admin/home"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
              >
                메인화면으로
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <AdminProcessGuide />
    </main>
  );
}

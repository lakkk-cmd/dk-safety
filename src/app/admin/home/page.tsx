import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminHomeMonitorDashboard from "@/components/admin/admin-home-monitor-dashboard";
import AdminHomeQuickNavLoader from "@/components/admin/admin-home-quick-nav-loader";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function AdminHomePage() {
  const quickLinks = [
    { href: "/admin/payment-settings", label: "결제 계좌 설정", emphasis: false },
    { href: "/admin/base-dispatch-fee", label: "기본 출장비", emphasis: false },
    { href: "/admin/backups", label: "백업 관리", emphasis: false }
  ] as const;

  return (
    <main className="page-fit mx-auto max-w-6xl">
      <header className="warranty-band dk-admin-band-header mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="warranty-badge dk-admin-warranty-badge">ADMIN CONSOLE</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">관리자 메인화면</h1>
            <p className="dk-admin-band-lead mt-2 max-w-2xl text-sm leading-relaxed text-slate-700">
              <strong className="font-bold text-slate-900">접수·기사·입금·정산</strong> 현황을 한 화면에서 모니터링한 뒤, 필요 시 각 업무 화면으로 바로
              이동하세요. 단계별 운영 순서는 왼쪽 <strong className="font-bold text-slate-900">「업무 진행 흐름」</strong>, 세부 검색은 하단{" "}
              <strong className="font-bold text-slate-900">「빠른 이동·검색」</strong>을 이용합니다.
            </p>
            <div className="dk-admin-link-row mt-4 flex flex-wrap gap-2">
              <Link
                href="/worker/login"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0b1c3a] shadow-sm transition hover:bg-slate-100"
              >
                기사 현장 페이지
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <AdminHomeMonitorDashboard />

      <details className="mb-10 rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md dark:border-slate-700 dark:bg-slate-950">
        <summary className="cursor-pointer select-none px-4 py-3 text-base font-black text-slate-900 marker:text-slate-400 dark:text-slate-100">
          빠른 이동·검색 (카드 메뉴)
        </summary>
        <div className="border-t border-slate-200 px-2 pb-4 pt-2 dark:border-slate-700">
          <AdminHomeQuickNavLoader />
        </div>
      </details>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">부가 설정</h2>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">위 카드 목록에 없는 자주 쓰는 설정입니다.</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/reservations"
            className="rounded-2xl border border-primary bg-primary px-4 py-3 text-sm font-bold text-white hover:brightness-105"
          >
            예약/정산 바로가기
          </Link>
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-2xl border px-4 py-3 text-sm font-bold transition",
                "border-slate-300 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

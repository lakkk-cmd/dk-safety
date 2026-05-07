import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminElectricalTipsNewTrigger from "@/components/admin/admin-electrical-tips-new-trigger";
import AdminElectricalTipsPanel from "@/components/admin/admin-electrical-tips-panel";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default function AdminElectricalTipsPage() {
  const enableDbSync = isSupabaseReservationsDbReady();

  return (
    <main className="page-fit mx-auto max-w-5xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="warranty-badge">ADMIN CONSOLE</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">생활전기정보 관리</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-700">
              안전·절약·자가점검·계절별 콘텐츠를 관리합니다. 발행된 항목만 입주민 쪽에서 조회할 수 있습니다. 목록은 노출 순서(`display_order`) 기준입니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/home"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
              >
                메인화면
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
            {enableDbSync ? <AdminElectricalTipsNewTrigger /> : null}
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      {enableDbSync ? (
        <AdminElectricalTipsPanel />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          Supabase DB 모드에서만 생활전기정보를 저장할 수 있습니다. `electrical_tips` 테이블(021 마이그레이션)과 환경 변수를 확인하세요.
        </section>
      )}
    </main>
  );
}

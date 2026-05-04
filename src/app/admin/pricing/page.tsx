import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminPricingCatalogPanel from "@/components/admin/admin-pricing-catalog-panel";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default function AdminPricingPage() {
  const enableDbSync = isSupabaseReservationsDbReady();

  return (
    <main className="page-fit mx-auto max-w-5xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="warranty-badge">ADMIN CONSOLE</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">요금/단가표</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-700">
              기본 출장비·서비스 항목별 금액과 안내 문구를 관리합니다. 표시 금액은 DB(`payment_settings`)와 동일하게 동기화됩니다. 각 행의「수정」에서 금액·비고를 바꾼 뒤 저장하세요.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/admin/home" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0b1c3a] shadow-sm transition hover:bg-slate-100">
                메인화면
              </Link>
              <Link href="/admin/base-dispatch-fee" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0b1c3a] shadow-sm transition hover:bg-slate-100">
                기본 출장비만 빠르게
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      {enableDbSync ? (
        <AdminPricingCatalogPanel />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          Supabase DB 모드에서만 요금/단가표를 저장할 수 있습니다. DB 연결 후 `payment_settings` 테이블에 `pricing_catalog` 컬럼이 있어야 합니다.
        </section>
      )}
    </main>
  );
}

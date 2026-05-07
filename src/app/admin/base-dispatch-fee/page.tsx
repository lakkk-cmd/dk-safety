import Link from "next/link";
import AdminConsoleLinks from "@/components/admin-console-links";
import AdminLogoutButton from "@/components/admin-logout-button";
import BaseDispatchFeeSettings from "@/components/admin/base-dispatch-fee-settings";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default function AdminBaseDispatchFeePage() {
  const enableDbSync = isSupabaseReservationsDbReady();

  return (
    <main className="page-fit max-w-6xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="warranty-badge">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">기본 출장비 설정</h1>
            <p className="mt-2 text-sm text-slate-700">
              고객에게 안내되는 기본 출장비(예약금) 금액만 설정합니다. 입금 계좌는「결제 계좌 설정」화면에서 다룹니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/home" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100">
                메인화면
              </Link>
              <Link
                href="/admin/payment-settings"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100"
              >
                결제 계좌 설정
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">빠른 이동</p>
          <AdminConsoleLinks active="dispatch-fee" />
        </div>
        {enableDbSync ? (
          <BaseDispatchFeeSettings />
        ) : (
          <section className="surface-card rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            Supabase DB 모드에서만 기본 출장비를 변경할 수 있습니다.
          </section>
        )}
      </div>
    </main>
  );
}

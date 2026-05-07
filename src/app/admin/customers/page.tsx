import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminConsoleLinks from "@/components/admin-console-links";
import AdminCustomerCarePanel from "@/components/admin/admin-customer-care-panel";
import type { AdminCustomerCareRow } from "@/lib/admin-customer-care";
import { pgListAdminCustomerCareRows } from "@/lib/admin-customer-care";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminCustomersPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit mx-auto max-w-6xl">
        <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="warranty-badge">관리자 콘솔</p>
              <h1 className="mt-2 text-3xl font-black text-slate-900">고객관리</h1>
              <p className="mt-2 text-sm text-slate-700">Supabase DB 모드에서 접수·주문 통합 조회를 사용할 수 있습니다.</p>
            </div>
            <AdminLogoutButton />
          </div>
        </header>
      </main>
    );
  }

  let rows: AdminCustomerCareRow[] = [];
  let loadError: string | null = null;
  try {
    rows = await pgListAdminCustomerCareRows();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.";
  }

  return (
    <main className="page-fit mx-auto max-w-6xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="warranty-badge">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">고객관리</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-700">
              접수 시 등록한 <strong className="text-slate-900">고객·주소·일정</strong>을 기준으로, 연결된{" "}
              <strong className="text-slate-900">주문·입금·배정·현장·보증</strong> 상태를 한 표에서 추적합니다. 하단 링크로 각 업무 화면으로
              이동할 수 있습니다.
            </p>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
        <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">빠른 이동</p>
        <AdminConsoleLinks active="customers" />
      </div>

      {loadError ? (
        <section className="surface-card rounded-2xl border border-[var(--line-soft)] px-4 py-8 text-center text-sm text-rose-700 shadow-[var(--shadow-soft)]">
          <p className="font-bold">데이터를 불러오지 못했습니다.</p>
          <p className="mt-2 font-mono text-xs text-rose-600">{loadError}</p>
          <p className="mt-3 text-xs text-slate-600">Supabase 연결·마이그레이션·RLS 설정을 확인해 주세요.</p>
        </section>
      ) : (
        <AdminCustomerCarePanel initialRows={rows} />
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
        <p className="font-bold text-slate-900 dark:text-slate-100">연결 업무 바로가기</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/admin/reservations" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800">
            예약/정산
          </Link>
          <Link href="/admin/finance" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800">
            금융·가상계좌
          </Link>
          <Link href="/admin/dispatch" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800">
            배정 관제
          </Link>
          <Link href="/admin/billing" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800">
            현장 정산
          </Link>
          <Link href="/admin/warranties" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:hover:bg-slate-800">
            보증서
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import AdminConsoleLinks from "@/components/admin-console-links";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminWorkerRegister from "@/components/admin-worker-register";
import { getSupabaseAdmin, usesSupabaseReservationsDb } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default function AdminWorkersPage() {
  const enableDbSync = usesSupabaseReservationsDb() && Boolean(getSupabaseAdmin());

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <header className="surface-editorial mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">기사 등록</h1>
            <p className="mt-2 text-sm text-slate-600">현장 기사 계정을 등록하고 갱신합니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin" className="btn-outline px-3 py-2 text-sm">
                관리자 메인
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="hidden md:block">
          <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="mb-2 px-1 text-xs font-semibold text-slate-500">관리 메뉴</p>
            <AdminConsoleLinks active="workers" mode="sidebar" />
          </div>
        </aside>
        <div className="space-y-4">
          <div className="md:hidden">
            <AdminConsoleLinks active="workers" />
          </div>
          {enableDbSync ? (
            <AdminWorkerRegister />
          ) : (
            <section className="surface-card rounded-2xl border border-slate-200 p-5 text-sm text-slate-600">
              Supabase DB 모드에서만 기사 등록을 사용할 수 있습니다.
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

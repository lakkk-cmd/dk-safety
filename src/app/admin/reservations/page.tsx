import Link from "next/link";
import AdminConsoleLinks from "@/components/admin-console-links";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminReservationsTable from "@/components/admin-reservations-table";
import LiveNotificationToast from "@/components/live/live-notification-toast";
import { readReservations } from "@/lib/reservations-store";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ id?: string | string[] }>;
};

function pickReservationIdParam(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const id = typeof v === "string" ? v.trim() : "";
  return id.length > 0 ? id : null;
}

export default async function AdminReservationsPage({ searchParams }: PageProps) {
  const reservations = await readReservations();
  const enableDbSync = isSupabaseReservationsDbReady();
  const sp = (await searchParams) ?? {};
  const focusReservationId = pickReservationIdParam(sp.id);

  return (
    <main className="page-fit max-w-6xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="warranty-badge">ADMIN CONSOLE</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">예약/정산</h1>
            <p className="mt-2 text-sm text-slate-700">예약 상태, 입금 상태, 기사 배정을 관리합니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/admin/home" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0b1c3a] shadow-sm transition hover:bg-slate-100">
                메인화면
              </Link>
              <Link href="/worker/login" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0b1c3a] shadow-sm transition hover:bg-slate-100">
                기사 현장 페이지
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">빠른 이동 · 왼쪽 사이드바와 동일 메뉴는 메인화면에서 한눈에 볼 수 있습니다.</p>
          <AdminConsoleLinks active="reservations" />
        </div>
        <AdminReservationsTable
          initialReservations={reservations}
          enableDbSync={enableDbSync}
          focusReservationId={focusReservationId}
        />
      </div>
      <LiveNotificationToast role="admin" />
    </main>
  );
}

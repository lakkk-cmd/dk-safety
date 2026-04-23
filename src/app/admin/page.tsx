import { listBackupSnapshots, readBackupStatus, readReservations } from "@/lib/reservations-store";
import { readActivityLogs } from "@/lib/activity-log";
import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminReservationsTable from "@/components/admin-reservations-table";
import AdminActivityPanel from "@/components/admin-activity-panel";
import AdminBackupStatus from "@/components/admin-backup-status";
import PageNavButtons from "@/components/page-nav-buttons";

export default async function AdminPage() {
  const reservations = await readReservations();
  const logs = await readActivityLogs(12);
  const [backupStatus, snapshots] = await Promise.all([readBackupStatus(), listBackupSnapshots(20)]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <PageNavButtons homeHref="/admin" homeLabel="관리자 홈" />
      <header className="surface-editorial mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">예약 통합 관리</h1>
            <p className="mt-2 text-sm text-slate-600">최근 접수 순으로 고객 예약 내역을 확인합니다.</p>
            <div className="mt-3">
              <Link href="/admin/resident-safety" className="btn-primary px-3 py-2 text-sm">
                입주민 자가진단 통합현황 보기
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <AdminReservationsTable initialReservations={reservations} />
        <div className="space-y-6">
          <AdminActivityPanel logs={logs} />
          <AdminBackupStatus
            snapshotCount={backupStatus.snapshotCount}
            latestSnapshotAt={backupStatus.latestSnapshotAt}
            rollingBackupUpdatedAt={backupStatus.rollingBackupUpdatedAt}
            snapshots={snapshots}
          />
        </div>
      </div>
    </main>
  );
}

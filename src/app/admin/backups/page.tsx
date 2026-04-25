import Link from "next/link";
import AdminConsoleLinks from "@/components/admin-console-links";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminBackupStatus from "@/components/admin-backup-status";
import { listBackupSnapshots, readBackupStatus } from "@/lib/reservations-store";

export const dynamic = "force-dynamic";

export default async function AdminBackupsPage() {
  const [backupStatus, snapshots] = await Promise.all([readBackupStatus(), listBackupSnapshots(20)]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 md:py-14">
      <header className="surface-editorial mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-950 md:text-4xl">백업 상태</h1>
            <p className="mt-2 text-sm text-slate-600">스냅샷 상태를 확인하고 복원/롤백을 수행합니다.</p>
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
            <AdminConsoleLinks active="backups" mode="sidebar" />
          </div>
        </aside>
        <div className="space-y-4">
          <div className="md:hidden">
            <AdminConsoleLinks active="backups" />
          </div>
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

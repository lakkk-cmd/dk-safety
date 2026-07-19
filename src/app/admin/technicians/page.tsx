import AdminWorkerRegister from "@/components/admin-worker-register";
import AdminWorkerManagementPanel from "@/components/admin/admin-worker-management-panel";
import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { pgReadReservations } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminTechniciansPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="기사/인증 관리" description="Supabase DB 모드에서 기사 관리를 사용할 수 있습니다." />
      </main>
    );
  }

  const reservations = await pgReadReservations();
  const activeTaskCount: Record<string, number> = {};
  for (const reservation of reservations) {
    if (!reservation.assignedWorkerId) continue;
    if (!reservation.taskStatus || reservation.taskStatus === "completed") continue;
    activeTaskCount[reservation.assignedWorkerId] = (activeTaskCount[reservation.assignedWorkerId] ?? 0) + 1;
  }

  return (
    <main className="page-fit max-w-6xl space-y-4">
      <AdminPageHeader
        title="기사/인증 관리"
        description="기사 등록, 인증/PIN 발급, 단가·전문분야·배정 가능 인력까지 한 화면에서 관리합니다."
      />
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <AdminWorkerRegister />
        </CardContent>
      </Card>
      <AdminWorkerManagementPanel activeTaskCount={activeTaskCount} />
    </main>
  );
}

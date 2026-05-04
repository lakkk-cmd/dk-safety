import AdminWorkerRegister from "@/components/admin-worker-register";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pgListWorkers, pgReadReservations } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminTechniciansPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <section className="space-y-4">
        <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Technician HR</CardTitle>
            <CardDescription className="dark:text-slate-300">Supabase DB 모드에서 기사 관리를 사용할 수 있습니다.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const [workers, reservations] = await Promise.all([pgListWorkers(), pgReadReservations()]);
  const activeTaskCount = new Map<string, number>();
  for (const reservation of reservations) {
    if (!reservation.assignedWorkerId) continue;
    if (!reservation.taskStatus || reservation.taskStatus === "completed") continue;
    activeTaskCount.set(reservation.assignedWorkerId, (activeTaskCount.get(reservation.assignedWorkerId) ?? 0) + 1);
  }

  return (
    <section className="space-y-4">
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Technician HR</CardTitle>
          <CardDescription className="dark:text-slate-300">
            기사 등록, 인증/PIN 발급, 배정 가능 인력 관리를 수행합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminWorkerRegister />
        </CardContent>
      </Card>
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">기사 배정 상태</CardTitle>
          <CardDescription className="dark:text-slate-300">활성 작업 수를 기준으로 현재 인력 상태를 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">기사명</th>
                  <th className="px-3 py-2">연락처</th>
                  <th className="px-3 py-2">활성여부</th>
                  <th className="px-3 py-2">진행 작업수</th>
                  <th className="px-3 py-2">등록일</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-3 py-2 font-semibold">{worker.name}</td>
                    <td className="px-3 py-2">{worker.phone}</td>
                    <td className="px-3 py-2">{worker.active ? "활성" : "비활성"}</td>
                    <td className="px-3 py-2">{activeTaskCount.get(worker.id) ?? 0}</td>
                    <td className="px-3 py-2">{new Date(worker.createdAt).toLocaleDateString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

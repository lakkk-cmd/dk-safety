import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { pgListWorkers, pgReadReservations } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import DispatchControlPanel from "@/components/admin/dispatch-control-panel";

export const dynamic = "force-dynamic";

export default async function AdminDispatchPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="실시간 배정 관제" description="Supabase DB 모드에서 배정 관제를 사용할 수 있습니다." />
      </main>
    );
  }

  const [apartments, orders, reservations, workers] = await Promise.all([
    pgListApartments(),
    pgListOrdersForAdmin(),
    pgReadReservations(),
    pgListWorkers()
  ]);
  const apartmentById = new Map(apartments.map((apt) => [apt.id, apt]));
  const paidOrders = orders.filter((order) => order.payment_status === "PAID");
  const readyCount = paidOrders.filter((order) => !["ASSIGNED", "IN_PROGRESS", "DONE"].includes(order.dispatch_status)).length;
  const assignedCount = paidOrders.filter((order) => order.dispatch_status === "ASSIGNED").length;
  const inProgressCount = reservations.filter((row) => row.taskStatus === "in_progress").length;
  const doneCount = reservations.filter((row) => row.taskStatus === "completed").length;

  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader title="실시간 배정 관제" description="결제 완료 주문을 실시간으로 확인하고 기사 배정을 관제합니다." />
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="space-y-3 pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">배정 대기</p>
              <p className="mt-1 text-2xl font-black text-dk-navy dark:text-slate-100">{readyCount}건</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">배정 완료</p>
              <p className="mt-1 text-2xl font-black text-dk-navy dark:text-slate-100">{assignedCount}건</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">현장 작업중</p>
              <p className="mt-1 text-2xl font-black text-dk-gold dark:text-slate-100">{inProgressCount}건</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">작업 완료</p>
              <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-slate-100">{doneCount}건</p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-200/50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
            선결제 확인(`payment_status=PAID`) 주문만 배정 가능 상태로 표시됩니다.
          </div>
          <DispatchControlPanel
            rows={paidOrders.slice(0, 40).map((order) => {
              const apt = apartmentById.get(order.apt_id ?? "");
              const info = order.resident_info ?? {};
              const reservation = reservations.find((row) => row.id === order.reservation_id);
              return {
                orderId: order.id,
                reservationId: order.reservation_id,
                apartmentName: apt?.name ?? "미지정",
                dong: info.dong ?? "-",
                ho: info.ho ?? "-",
                dispatchStatus: order.dispatch_status,
                taskStatus: reservation?.taskStatus ?? null,
                assignedWorkerName: reservation?.assignedWorkerName ?? null,
                lastDeclineReason: reservation?.lastDeclineReason ?? null,
                lastDeclinedWorkerName: reservation?.lastDeclinedWorkerName ?? null,
                lastDeclinedAt: reservation?.lastDeclinedAt ?? null
              };
            })}
            workers={workers}
          />
        </CardContent>
      </Card>
    </main>
  );
}

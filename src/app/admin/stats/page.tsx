import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { pgReadReservations } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminStatsPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <section className="space-y-4">
        <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
          <CardHeader>
            <CardTitle className="text-slate-900 dark:text-slate-100">Insight &amp; Config</CardTitle>
            <CardDescription className="dark:text-slate-300">Supabase DB 모드에서 통계 관제를 사용할 수 있습니다.</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const [apartments, orders, reservations] = await Promise.all([pgListApartments(), pgListOrdersForAdmin(), pgReadReservations()]);
  const totalRevenue = orders.reduce((sum, order) => sum + (order.total_final_fee ?? order.base_fee ?? 0), 0);
  const paidCount = orders.filter((order) => order.payment_status === "PAID").length;
  const completionCount = reservations.filter((reservation) => reservation.status === "완료").length;
  const apartmentMetrics = apartments.map((apt) => {
    const aptOrders = orders.filter((order) => order.apt_id === apt.id);
    return {
      id: apt.id,
      name: apt.name,
      count: aptOrders.length,
      amount: aptOrders.reduce((sum, row) => sum + (row.total_final_fee ?? row.base_fee ?? 0), 0)
    };
  });

  return (
    <section className="space-y-4">
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-slate-100">Insight &amp; Config</CardTitle>
          <CardDescription className="dark:text-slate-300">
            단지별 매출, 이용률, 운영 지표를 모니터링하는 통계 영역입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">총 매출</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{totalRevenue.toLocaleString("ko-KR")}원</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">결제 완료 주문</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{paidCount}건</p>
            </div>
            <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-xs text-slate-500 dark:text-slate-400">완료된 예약</p>
              <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{completionCount}건</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">단지명</th>
                  <th className="px-3 py-2">주문수</th>
                  <th className="px-3 py-2">누적 매출</th>
                </tr>
              </thead>
              <tbody>
                {apartmentMetrics
                  .sort((a, b) => b.amount - a.amount)
                  .map((row) => (
                    <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.count}건</td>
                      <td className="px-3 py-2 font-semibold">{row.amount.toLocaleString("ko-KR")}원</td>
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

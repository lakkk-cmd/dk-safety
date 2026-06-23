import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="현장 정산 승인" description="Supabase DB 모드에서 정산 관제를 사용할 수 있습니다." />
      </main>
    );
  }

  const [apartments, orders] = await Promise.all([pgListApartments(), pgListOrdersForAdmin()]);
  const apartmentById = new Map(apartments.map((apt) => [apt.id, apt]));

  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader title="현장 정산 승인" description="가변 비용 검증, 최종 정산 승인, 기사/플랫폼 리포트를 관리합니다." />
      <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
        <CardContent className="pt-6">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-200/70 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">단지명</th>
                  <th className="px-3 py-2">동/호수</th>
                  <th className="px-3 py-2">기본료</th>
                  <th className="px-3 py-2">최종정산</th>
                  <th className="px-3 py-2">차액</th>
                  <th className="px-3 py-2">정산상태</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 40).map((order) => {
                  const apt = apartmentById.get(order.apt_id ?? "");
                  const info = order.resident_info ?? {};
                  const finalFee = order.total_final_fee ?? order.base_fee ?? 0;
                  const delta = Math.max(0, finalFee - (order.base_fee ?? 0));
                  return (
                    <tr key={order.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">{apt?.name ?? "미지정"}</td>
                      <td className="px-3 py-2">{info.dong ?? "-"}-{info.ho ?? "-"}</td>
                      <td className="px-3 py-2">{(order.base_fee ?? 0).toLocaleString("ko-KR")}원</td>
                      <td className="px-3 py-2">{finalFee.toLocaleString("ko-KR")}원</td>
                      <td className="px-3 py-2 font-semibold text-amber-700 dark:text-amber-300">{delta.toLocaleString("ko-KR")}원</td>
                      <td className="px-3 py-2">{order.final_payment_status ?? "PENDING"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

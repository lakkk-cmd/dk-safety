import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminBillingApprovalPanel from "@/components/admin/admin-billing-approval-panel";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { getJobProfitabilityBatch } from "@/lib/financial-ledger";

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
  const profitByReservation = await getJobProfitabilityBatch(
    orders.map((o) => o.reservation_id).filter((id): id is string => Boolean(id))
  );

  return (
    <main className="page-fit max-w-6xl">
      <AdminPageHeader
        title="현장 정산 승인"
        description="가변 비용 검증, 최종 정산 승인, 기사/플랫폼 리포트를 관리합니다. 「승인」은 계좌이체·현장 현금 등 온라인 카드결제 없이 받은 추가비용을 확정하고 보증서를 발급합니다."
      />
      <AdminBillingApprovalPanel
        initialOrders={orders}
        apartments={apartments}
        profitByReservation={Object.fromEntries(profitByReservation)}
      />
    </main>
  );
}

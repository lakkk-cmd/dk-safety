import AdminPageHeader from "@/components/admin/admin-page-header";
import AdminFinancePanel from "@/components/admin/admin-finance-panel";
import AdminAccountReconciliationPanel from "@/components/admin/admin-account-reconciliation-panel";
import BusinessMainAccountForm from "@/components/admin/business-main-account-form";
import { pgListApartments } from "@/lib/apartments-pg";
import { pgListOrdersForAdmin } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function FinanceAdminPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl space-y-6">
        <AdminPageHeader title="금융/가상계좌 관리" description="Supabase DB 모드에서 입금·환불 관제를 사용할 수 있습니다." />
        <BusinessMainAccountForm />
      </main>
    );
  }

  const [apartments, orders] = await Promise.all([pgListApartments(), pgListOrdersForAdmin()]);

  return (
    <main className="page-fit max-w-6xl space-y-6">
      <AdminPageHeader title="금융/가상계좌 관리" description="입금·가상계좌 모니터링, 수동환불 추적과 사업자 주계좌(고객 입금 안내)를 관리합니다." />
      <AdminFinancePanel initialOrders={orders} apartments={apartments} />
      <AdminAccountReconciliationPanel />
      <BusinessMainAccountForm />
    </main>
  );
}

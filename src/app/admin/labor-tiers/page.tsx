import AdminLaborTierPanel from "@/components/admin/admin-labor-tier-panel";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminLaborTiersPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="작업비 난이도 정액표" description="Supabase DB 모드에서 작업비 난이도 정액표를 관리할 수 있습니다." />
      </main>
    );
  }

  const supabase = requireSupabaseAdmin();
  const { data } = await supabase
    .from("labor_tier_catalog")
    .select("id, label, max_minutes, amount, active, display_order")
    .order("display_order", { ascending: true });

  return (
    <main className="page-fit mx-auto max-w-5xl space-y-4">
      <AdminPageHeader title="작업비 난이도 정액표" description="현장 작업 난이도(하/중/상)별 소요시간 상한과 정액 작업비를 관리합니다." />
      <AdminLaborTierPanel initialLaborTiers={data ?? []} />
    </main>
  );
}

import AdminMaterialCatalogPanel from "@/components/admin/admin-material-catalog-panel";
import AdminPageHeader from "@/components/admin/admin-page-header";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function AdminMaterialsPage() {
  if (!isSupabaseReservationsDbReady()) {
    return (
      <main className="page-fit max-w-6xl">
        <AdminPageHeader title="재료비 카탈로그" description="Supabase DB 모드에서 재료비 카탈로그를 관리할 수 있습니다." />
      </main>
    );
  }

  const supabase = requireSupabaseAdmin();
  const { data } = await supabase
    .from("material_catalog")
    .select("id, name, unit_price, active, display_order")
    .order("display_order", { ascending: true });

  return (
    <main className="page-fit mx-auto max-w-5xl space-y-4">
      <AdminPageHeader title="재료비 카탈로그" description="현장 작업 시 사용하는 자재 품목과 정액 자재비를 관리합니다." />
      <AdminMaterialCatalogPanel initialMaterials={data ?? []} />
    </main>
  );
}

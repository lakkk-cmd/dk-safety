import Link from "next/link";
import AdminLogoutButton from "@/components/admin-logout-button";
import AdminPricingViewTabs from "@/components/admin/admin-pricing-view-tabs";
import { pgListApartments } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

type ViewMode = "pricing" | "materials" | "labor-tiers" | "service-items";

type PageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function AdminPricingPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const initialView: ViewMode =
    sp.tab === "materials"
      ? "materials"
      : sp.tab === "labor-tiers"
        ? "labor-tiers"
        : sp.tab === "service-items"
          ? "service-items"
          : "pricing";
  const enableDbSync = isSupabaseReservationsDbReady();

  const [materialsRes, laborTiersRes, apartments] = enableDbSync
    ? await Promise.all([
        requireSupabaseAdmin()
          .from("material_catalog")
          .select("id, name, unit_price, cost_price, active, display_order")
          .order("display_order", { ascending: true }),
        requireSupabaseAdmin()
          .from("labor_tier_catalog")
          .select("id, label, max_minutes, amount, active, display_order")
          .order("display_order", { ascending: true }),
        pgListApartments()
      ])
    : [{ data: null }, { data: null }, []];

  return (
    <main className="page-fit mx-auto max-w-5xl">
      <header className="warranty-band mb-6 rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="warranty-badge">관리자 콘솔</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-slate-900 md:text-4xl">요금/단가표</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-700">
              출장비·서비스 요금, 재료비 카탈로그, 작업비 난이도 정액표, 최종정산 계산식까지 실제로 청구되는 모든 금액을 이 화면
              하나에서 관리합니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/admin/home" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100">
                메인화면
              </Link>
              <Link href="/admin/base-dispatch-fee" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-dk-navy shadow-sm transition hover:bg-slate-100">
                기본 출장비만 빠르게
              </Link>
            </div>
          </div>
          <AdminLogoutButton />
        </div>
      </header>

      {enableDbSync ? (
        <AdminPricingViewTabs
          initialMaterials={materialsRes.data ?? []}
          initialLaborTiers={laborTiersRes.data ?? []}
          apartments={(apartments as { id: string; name: string }[]).map((a) => ({ id: a.id, name: a.name }))}
          initialView={initialView}
        />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          Supabase DB 모드에서만 요금/단가표를 저장할 수 있습니다. DB 연결 후 `payment_settings` 테이블에 `pricing_catalog` 컬럼이 있어야 합니다.
        </section>
      )}
    </main>
  );
}

"use client";

import { useState } from "react";
import AdminPricingCatalogPanel from "@/components/admin/admin-pricing-catalog-panel";
import AdminMaterialCatalogPanel from "@/components/admin/admin-material-catalog-panel";
import AdminLaborTierPanel from "@/components/admin/admin-labor-tier-panel";
import AdminServiceItemPanel from "@/components/admin/admin-service-item-panel";
import { cn } from "@/lib/utils";

type MaterialRow = { id: string; name: string; unit_price: number; active: boolean; display_order: number };
type LaborTierRow = { id: string; label: string; max_minutes: number; amount: number; active: boolean; display_order: number };
type ApartmentOption = { id: string; name: string };

type ViewMode = "pricing" | "materials" | "labor-tiers" | "service-items";

type Props = {
  initialMaterials: MaterialRow[];
  initialLaborTiers: LaborTierRow[];
  apartments: ApartmentOption[];
  initialView: ViewMode;
};

const TABS: { key: ViewMode; label: string }[] = [
  { key: "pricing", label: "출장비·서비스 요금" },
  { key: "materials", label: "재료비 카탈로그" },
  { key: "labor-tiers", label: "작업비 난이도 정액표" },
  { key: "service-items", label: "최종정산 계산식" }
];

/**
 * 2026-07-19: 요금/단가표(payment_settings.pricing_catalog) · 재료비 카탈로그(material_catalog) ·
 * 작업비 난이도 정액표(labor_tier_catalog) · 최종정산 계산식(service_items) — 서로 다른 테이블이지만
 * 전부 "가격 정책" 성격이라 화면 여러 개로 흩어져 있던 것을 /admin/pricing 하나의 탭으로 합침.
 */
export default function AdminPricingViewTabs({ initialMaterials, initialLaborTiers, apartments, initialView }: Props) {
  const [view, setView] = useState<ViewMode>(initialView);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="가격 정책 보기">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            onClick={() => setView(tab.key)}
            className={cn(
              "rounded-full border-2 px-4 py-2 text-xs font-bold transition",
              view === tab.key
                ? "border-dk-navy bg-dk-navy text-white dark:border-sky-500 dark:bg-sky-600"
                : "border-slate-200 bg-white text-slate-600 hover:border-dk-navy/40 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {view === "pricing" ? <AdminPricingCatalogPanel /> : null}
      {view === "materials" ? <AdminMaterialCatalogPanel initialMaterials={initialMaterials} /> : null}
      {view === "labor-tiers" ? <AdminLaborTierPanel initialLaborTiers={initialLaborTiers} /> : null}
      {view === "service-items" ? <AdminServiceItemPanel apartments={apartments} /> : null}
    </div>
  );
}

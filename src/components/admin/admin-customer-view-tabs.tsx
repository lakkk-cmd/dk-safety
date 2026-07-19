"use client";

import { useState } from "react";
import AdminCustomerCarePanel from "@/components/admin/admin-customer-care-panel";
import AdminCrmCustomerPanel from "@/components/admin/admin-crm-customer-panel";
import type { AdminCustomerCareRow } from "@/lib/admin-customer-care";
import { cn } from "@/lib/utils";

type ViewMode = "pipeline" | "crm";

type Props = {
  initialRows: AdminCustomerCareRow[];
  initialView: ViewMode;
};

/**
 * 2026-07-19: /admin/customers(예약 건 단위)와 /admin/crm/customers(전화번호 단위)가
 * 같은 reservations 데이터를 두 화면으로 나눠 보여주던 것을 한 페이지 + 탭으로 통합.
 * /admin/crm/customers는 리다이렉트 스텁(?view=crm)으로 전환됨.
 */
export default function AdminCustomerViewTabs({ initialRows, initialView }: Props) {
  const [view, setView] = useState<ViewMode>(initialView);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="고객 보기 방식">
        <button
          type="button"
          role="tab"
          aria-selected={view === "pipeline"}
          onClick={() => setView("pipeline")}
          className={cn(
            "rounded-full border-2 px-4 py-2 text-xs font-bold transition",
            view === "pipeline"
              ? "border-dk-navy bg-dk-navy text-white dark:border-sky-500 dark:bg-sky-600"
              : "border-slate-200 bg-white text-slate-600 hover:border-dk-navy/40 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300"
          )}
        >
          예약별 보기 — 접수·주문·배정·보증
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "crm"}
          onClick={() => setView("crm")}
          className={cn(
            "rounded-full border-2 px-4 py-2 text-xs font-bold transition",
            view === "crm"
              ? "border-dk-navy bg-dk-navy text-white dark:border-sky-500 dark:bg-sky-600"
              : "border-slate-200 bg-white text-slate-600 hover:border-dk-navy/40 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-300"
          )}
        >
          고객별 보기 — 재상담·잠재고객
        </button>
      </div>
      {view === "pipeline" ? <AdminCustomerCarePanel initialRows={initialRows} /> : <AdminCrmCustomerPanel />}
    </div>
  );
}

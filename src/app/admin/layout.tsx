"use client";

import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar";
import { adminSidebarNavItems } from "@/lib/admin-nav";
import { ADMIN_SHELL_CRITICAL_CSS } from "@/lib/admin-shell-critical-css";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";
  const [prepPending, setPrepPending] = useState(0);
  const [settlePending, setSettlePending] = useState(0);

  useEffect(() => {
    if (isLoginPage) return;
    let disposed = false;
    const syncBadgeCount = async () => {
      try {
        const response = await fetch("/api/admin/console-snapshot", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as { orders?: Array<Record<string, unknown>> };
        const orders = Array.isArray(json.orders) ? json.orders : [];
        const prep = orders.filter((o) => String(o.dispatch_status ?? "").toUpperCase() === "READY" && o.prepayment_confirmed === true).length;
        const settle = orders.filter((o) => String(o.final_payment_status ?? "").toUpperCase() === "REQUESTED").length;
        if (disposed) return;
        setPrepPending(prep);
        setSettlePending(settle);
      } catch {
        // ignore polling errors
      }
    };
    void syncBadgeCount();
    const timer = window.setInterval(() => {
      void syncBadgeCount();
    }, 10000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isLoginPage]);

  const shellClass =
    "flex min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100";

  if (isLoginPage) {
    return (
      <Fragment>
        <style dangerouslySetInnerHTML={{ __html: ADMIN_SHELL_CRITICAL_CSS }} />
        <div className="dk-admin-login-shell">
          <div className="dk-admin-login-inner w-full">{children}</div>
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <style dangerouslySetInnerHTML={{ __html: ADMIN_SHELL_CRITICAL_CSS }} />
      <div className={cn(shellClass, "dk-admin-root")} data-dk-admin-root>
      <Sidebar className="bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900">
        <SidebarHeader>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">관제 센터</p>
          <h1 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">우리집 전기주치의(대경이엔피)</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">운영 관리 시스템</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {adminSidebarNavItems.map((menu) => {
              const Icon = menu.icon;
              const active = pathname === menu.href || pathname.startsWith(menu.href + "/");
              return (
                <Fragment key={menu.href}>
                  {menu.sectionLabel && (
                    <li className="px-3 pb-1 pt-4">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        {menu.sectionLabel}
                      </p>
                    </li>
                  )}
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={active} onClick={() => router.push(menu.href)}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{menu.label}</span>
                      {menu.href === "/admin/dispatch" && prepPending > 0 ? (
                        <span className="ml-auto inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">
                          {prepPending > 99 ? "99+" : prepPending}
                        </span>
                      ) : null}
                      {menu.href === "/admin/billing" && settlePending > 0 ? (
                        <span className="ml-auto inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-amber-950">
                          {settlePending}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </Fragment>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        {/* 자식 페이지가 각각 <main>을 쓰므로 여기서는 래퍼만 둡니다(중첩 <main> 방지). */}
        <div className="dk-admin-main-inner min-h-screen flex-1 overflow-auto p-4 md:p-6">{children}</div>
      </SidebarInset>
    </div>
    </Fragment>
  );
}

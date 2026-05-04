"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Control Center</p>
          <h1 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">대경안심전기 관리자</h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">네이비/그레이 기반 관제 대시보드</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {adminSidebarNavItems.map((menu) => {
              const Icon = menu.icon;
              const active = pathname === menu.href;
              return (
                <SidebarMenuItem key={menu.href}>
                  <SidebarMenuButton isActive={active} onClick={() => router.push(menu.href)}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{menu.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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

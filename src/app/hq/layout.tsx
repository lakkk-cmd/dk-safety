"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminLogoutButton from "@/components/admin-logout-button";
import ImprovementRequestWidget from "@/components/hq/improvement-request-widget";

export default function HqLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/hq/login" || pathname === "/login";

  if (isLoginPage) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">HQ COMMAND CENTER</p>
            <h1 className="mt-1 text-lg font-black text-slate-900">경영진 사령부 HQ</h1>
          </div>
          <AdminLogoutButton />
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">{children}</div>
      <ImprovementRequestWidget />
    </div>
  );
}

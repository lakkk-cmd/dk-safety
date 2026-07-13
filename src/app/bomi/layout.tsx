"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function BomiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/bomi/login";

  if (isLoginPage) {
    return <div className="min-h-screen bg-slate-100">{children}</div>;
  }

  const onLogout = async () => {
    await fetch("/api/bomi/auth/logout", { method: "POST" });
    router.replace("/bomi/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="page-fit flex items-center justify-between !py-3">
          <Link href="/bomi" className="text-lg font-black text-slate-950">
            보미 <span className="text-sm font-semibold text-slate-500">보험설계사 CRM</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-600">
            <Link href="/bomi" className={pathname === "/bomi" ? "text-primary" : ""}>
              대시보드
            </Link>
            <Link href="/bomi/customers/new" className={pathname === "/bomi/customers/new" ? "text-primary" : ""}>
              고객 등록
            </Link>
            <button type="button" onClick={onLogout} className="btn-outline px-3 py-1.5 text-xs">
              로그아웃
            </button>
          </nav>
        </div>
      </header>
      <main className="page-fit">{children}</main>
    </div>
  );
}

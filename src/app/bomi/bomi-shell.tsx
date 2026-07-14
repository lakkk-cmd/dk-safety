"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function BomiShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // 서브도메인(bomi.dkansim.com)에서는 middleware rewrite로 인해 usePathname()이
  // 내부 경로("/bomi/login")를 돌려주고, 클라이언트 네비게이션 직후에는 브라우저가
  // 실제로 요청한 경로("/login")를 돌려줄 수 있다 — hq/layout.tsx와 동일하게 둘 다 체크한다.
  const isLoginPage = pathname === "/bomi/login" || pathname === "/login";
  const isDashboard = pathname === "/bomi" || pathname === "/";
  const isNewCustomer = pathname === "/bomi/customers/new" || pathname === "/customers/new";

  if (isLoginPage) {
    return <div className="min-h-screen bg-slate-100">{children}</div>;
  }

  const onLogout = async () => {
    await fetch("/api/bomi/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="page-fit flex items-center justify-between !py-3">
          <Link href="/" className="text-lg font-black text-slate-950">
            보미 <span className="text-sm font-semibold text-slate-500">보험설계사 CRM</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold text-slate-600">
            <Link href="/" className={isDashboard ? "text-primary" : ""}>
              대시보드
            </Link>
            <Link href="/customers/new" className={isNewCustomer ? "text-primary" : ""}>
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminLogoutButton from "@/components/admin-logout-button";
import BrandLockup from "@/components/brand-lockup";
import SubdomainNav from "@/components/subdomain-nav";

const TABS = [
  { href: "/", label: "홈" },
  { href: "/reservation", label: "예약" },
  { href: "/videos", label: "영상" },
  { href: "/intelligence", label: "인텔리전스" },
  { href: "/report", label: "보고서" },
] as const;

export default function HqShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/hq/summary", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { notificationCount?: number };
        if (!cancelled) setNotificationCount(data.notificationCount ?? 0);
      } catch {
        // 배지 갱신 실패는 조용히 무시
      }
    };
    void load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // 홈(루트)이 이제 채팅을 겸하므로, 채팅에 필요했던 풀높이 레이아웃을 홈에도 적용한다.
  const isHome = pathname === "/";

  return (
    <div className={`flex flex-col bg-cc-bg text-cc-text overflow-x-hidden w-full ${isHome ? "h-dvh" : "min-h-dvh"}`}>
      <header className="flex-shrink-0 bg-cc-navy text-white w-full overflow-x-hidden">
        <div className="flex w-full items-center justify-between gap-3 px-3 py-3 md:mx-auto md:max-w-5xl md:px-6 md:py-4">
          <BrandLockup />
          <div className="flex items-center gap-3">
            {notificationCount > 0 ? (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cc-gold px-2 text-xs font-black text-cc-navy">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            ) : null}
            <AdminLogoutButton variant="dark" />
          </div>
        </div>
        <SubdomainNav />
        <nav className="w-full overflow-x-auto px-2 md:mx-auto md:max-w-5xl md:px-4">
          <ul className="flex min-w-max gap-1">
            {TABS.map((tab) => {
              const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={`flex min-h-12 items-center px-4 text-sm font-bold transition ${
                      active
                        ? "border-b-2 border-cc-gold text-cc-gold"
                        : "border-b-2 border-transparent text-white/70 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <div className={isHome ? "flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3" : "mx-auto w-full max-w-5xl px-4 py-3 md:px-6 md:py-6"}>{children}</div>
    </div>
  );
}

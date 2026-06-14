"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminLogoutButton from "@/components/admin-logout-button";

const TABS = [
  { href: "/hq", label: "대시보드" },
  { href: "/hq/content", label: "콘텐츠" },
  { href: "/hq/reservation", label: "예약" },
  { href: "/hq/pipeline", label: "파이프라인" },
  { href: "/hq/report", label: "보고서" },
  { href: "/hq/improve", label: "개선요청" },
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

  return (
    <div className="min-h-screen bg-cc-bg text-cc-text">
      <header className="bg-cc-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">HQ COMMAND CENTER</p>
            <h1 className="mt-1 text-lg font-black">대장 본부</h1>
          </div>
          <div className="flex items-center gap-3">
            {notificationCount > 0 ? (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-cc-gold px-2 text-xs font-black text-cc-navy">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            ) : null}
            <AdminLogoutButton variant="dark" />
          </div>
        </div>
        <nav className="mx-auto max-w-5xl overflow-x-auto px-2 md:px-4">
          <ul className="flex min-w-max gap-1">
            {TABS.map((tab) => {
              const active = tab.href === "/hq" ? pathname === "/hq" : pathname.startsWith(tab.href);
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
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">{children}</div>
    </div>
  );
}

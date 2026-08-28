"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AptManagerInstallButton from "./apt-manager-install-button";

const TABS = [
  { href: "/apt-manager/inspect", label: "점검입력" },
  { href: "/apt-manager/history", label: "점검이력" },
  { href: "/apt-manager/guide", label: "점검가이드" },
  { href: "/apt-manager/subscribe", label: "구독관리" }
] as const;

export default function AptManagerChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const logout = async () => {
    await fetch("/api/apt-manager/logout", { method: "POST" });
    window.location.href = "/apt-manager/login";
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-dk-blue">우리집 안심전기(대경이엔피)</p>
            <p className="text-sm font-black text-slate-900">공동주택 세대 전기설비점검</p>
          </div>
          <div className="flex items-center gap-1.5">
            <AptManagerInstallButton />
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-4">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((tab) => {
            const active = pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 py-3 text-center text-[13px] font-bold transition ${
                  active ? "border-t-2 border-dk-blue text-dk-blue" : "border-t-2 border-transparent text-slate-400"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

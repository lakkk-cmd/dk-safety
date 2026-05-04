"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatIcon, HomeIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";

const BUSINESS_PHONE = (process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? "010-1234-5678").replaceAll("-", "");
const KAKAO_LINK = process.env.NEXT_PUBLIC_KAKAO_OPENCHAT_URL ?? "https://open.kakao.com/";

export default function GlobalQuickActions() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (pathname.startsWith("/admin")) return null;
  if (pathname.startsWith("/worker")) return null;
  const homeActive = pathname === "/home";
  const diagnosisActive = pathname.startsWith("/resident/safety-check") || pathname.startsWith("/resident/history");

  return (
    <nav className="fixed inset-x-0 bottom-3 z-50 px-4">
      <div className="mx-auto flex max-w-md items-center justify-between rounded-2xl border border-blue-700/30 bg-gradient-to-r from-primary via-blue-700 to-indigo-700 px-3 py-2 shadow-[0_16px_32px_rgba(15,23,42,0.35)] backdrop-blur">
        <Link
          href="/home"
          className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
            homeActive ? "bg-white text-primary shadow-[0_8px_18px_rgba(255,255,255,0.35)]" : "text-blue-100"
          }`}
        >
          <HomeIcon className="h-4 w-4" />
          홈
        </Link>
        <Link
          href="/resident/safety-check"
          className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
            diagnosisActive ? "bg-white text-indigo-700 shadow-[0_8px_18px_rgba(255,255,255,0.35)]" : "text-blue-100"
          }`}
        >
          <ShieldIcon className="h-4 w-4" />
          자가진단
        </Link>
        <a href={`tel:${BUSINESS_PHONE}`} className="flex flex-col items-center gap-1 rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(16,185,129,0.35)]">
          <PhoneIcon className="h-4 w-4" />
          전화
        </a>
        <a
          href={KAKAO_LINK}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center gap-1 rounded-lg bg-yellow-300 px-2 py-1 text-[11px] font-semibold text-slate-900 shadow-[0_8px_18px_rgba(234,179,8,0.4)]"
        >
          <ChatIcon className="h-4 w-4" />
          상담
        </a>
      </div>
    </nav>
  );
}

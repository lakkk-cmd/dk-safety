"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminLogoutButton from "@/components/admin-logout-button";
import BrandLockup from "@/components/brand-lockup";
import SubdomainNav from "@/components/subdomain-nav";

type NavItem = { href: string; label: string };
type NavEntry = { type: "link"; href: string; label: string } | { type: "group"; label: string; items: NavItem[] };

// 홈/AI채팅은 단독 탭으로 두고, 나머지는 성격이 비슷한 것끼리 그룹으로 묶어 한눈에 늘어놔 보이지 않게 한다.
const NAV: NavEntry[] = [
  { type: "link", href: "/", label: "홈" },
  { type: "link", href: "/chat", label: "AI 채팅" },
  {
    type: "group",
    label: "운영",
    items: [
      { href: "/reservation", label: "예약" },
      { href: "/report", label: "보고서" },
    ],
  },
  {
    type: "group",
    label: "콘텐츠",
    items: [
      { href: "/videos", label: "영상" },
      { href: "/blog-jobs", label: "블로그" },
      { href: "/intelligence", label: "인텔리전스" },
    ],
  },
];

function NavGroup({
  label,
  items,
  logicalPath,
  resolveHref,
  isOpen,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  logicalPath: string;
  resolveHref: (href: string) => string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const active = items.some((item) => logicalPath.startsWith(item.href));

  return (
    <li className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex min-h-12 items-center gap-1 px-4 text-sm font-bold transition ${
          active ? "border-b-2 border-cc-gold text-cc-gold" : "border-b-2 border-transparent text-white/70 hover:text-white"
        }`}
      >
        {label}
        <span className={`text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
      </button>
      {isOpen ? (
        <ul className="absolute left-0 top-full z-20 min-w-36 rounded-lg bg-cc-navy py-1 shadow-lg">
          {items.map((item) => {
            const itemActive = logicalPath.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={resolveHref(item.href)}
                  className={`block px-4 py-2 text-sm font-bold whitespace-nowrap ${
                    itemActive ? "text-cc-gold" : "text-white/80 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export default function HqShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // hq.dkansim.com에서는 미들웨어가 호스트 기반으로 "/"→"/hq"를 재작성해줘서 pathname이 "/", "/reservation"
  // 처럼 루트 상대경로로 보이지만, 그 재작성이 없는 환경(localhost 직접 접속, 프리뷰 배포 등)에서는
  // pathname이 "/hq", "/hq/reservation"처럼 그대로 노출된다. 이 두 경우를 모두 지원하도록 nav의
  // 논리 경로(logicalPath)와 실제 링크(resolveHref)를 분리한다 — 안 그러면 후자의 환경에서 "홈"을
  // 눌러도 "/"(호스트 재작성이 없으니 공개 고객 홈으로 감)로 튀어버린다.
  const isDirectHqPath = pathname === "/hq" || pathname.startsWith("/hq/");
  const logicalPath = isDirectHqPath ? pathname.slice(3) || "/" : pathname;
  const resolveHref = (href: string) => (isDirectHqPath ? (href === "/" ? "/hq" : `/hq${href}`) : href);

  const [notificationCount, setNotificationCount] = useState(0);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

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

  // 페이지 이동 시 열려있던 드롭다운은 자동으로 닫는다.
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  // 드롭다운 바깥을 클릭하면 닫는다.
  useEffect(() => {
    if (!openGroup) return;
    const handleClick = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openGroup]);

  // AI 채팅은 별도 메뉴(/chat)로 분리되어 있어, 채팅에 필요한 풀높이 레이아웃은 그 탭에서만 쓴다.
  // 홈(루트)은 이제 순수 대시보드 요약 화면이라 다른 탭과 같은 일반 레이아웃을 쓴다.
  const isChatPage = logicalPath === "/chat";

  return (
    <div className={`flex flex-col bg-cc-bg text-cc-text overflow-x-hidden w-full ${isChatPage ? "h-dvh" : "min-h-dvh"}`}>
      {/* overflow-x-hidden을 두지 않는다 — 걸면 세로도 암묵적으로 클리핑돼 드롭다운 메뉴가 헤더 높이 안에서
          잘린다. 자식(SubdomainNav)이 자기 가로 스크롤을 스스로 관리하므로 여기서 다시 막을 필요가 없다. */}
      <header className="flex-shrink-0 bg-cc-navy text-white w-full">
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
        {/* overflow-x-auto를 쓰지 않는다 — CSS 스펙상 한 축에 auto를 걸면 다른 축도 암묵적으로 클리핑돼
            드롭다운 메뉴가 nav 높이 안에서 잘려버린다. 이제 최상단 항목이 4개뿐이라 가로 스크롤이 필요 없다. */}
        <nav ref={navRef} className="w-full px-2 md:mx-auto md:max-w-5xl md:px-4">
          <ul className="flex min-w-max gap-1">
            {NAV.map((entry) => {
              if (entry.type === "link") {
                const active = entry.href === "/" ? logicalPath === "/" : logicalPath.startsWith(entry.href);
                return (
                  <li key={entry.href}>
                    <Link
                      href={resolveHref(entry.href)}
                      className={`flex min-h-12 items-center px-4 text-sm font-bold transition ${
                        active
                          ? "border-b-2 border-cc-gold text-cc-gold"
                          : "border-b-2 border-transparent text-white/70 hover:text-white"
                      }`}
                    >
                      {entry.label}
                    </Link>
                  </li>
                );
              }
              return (
                <NavGroup
                  key={entry.label}
                  label={entry.label}
                  items={entry.items}
                  logicalPath={logicalPath}
                  resolveHref={resolveHref}
                  isOpen={openGroup === entry.label}
                  onToggle={() => setOpenGroup((cur) => (cur === entry.label ? null : entry.label))}
                />
              );
            })}
          </ul>
        </nav>
      </header>
      <div className={isChatPage ? "flex min-h-0 flex-1 flex-col overflow-hidden p-2 md:p-3" : "mx-auto w-full max-w-5xl px-4 py-3 md:px-6 md:py-6"}>{children}</div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  ADMIN_HOME_HREF,
  adminQuickNavCards,
  adminQuickSearchScopeForHref,
  type AdminQuickSearchScope
} from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

type QuickSearchHit = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const PLACEHOLDER: Record<AdminQuickSearchScope, string> = {
  apartments: "단지명·코드·계좌번호 일부…",
  pricing: "항목명·요금 키워드…",
  finance: "주문·예약 ID, 가상계좌, 전화번호…",
  dispatch: "주문·예약 ID, 연락처… (입금완료 건)",
  billing: "주문·예약 ID, 정산 관련…",
  warranties: "보증번호·예약 ID 일부…",
  technicians: "기사명·전화번호…",
  customers: "고객명·전화·주소·예약 ID·가상계좌…",
  "electrical-tips": "제목·요약·본문·카테고리 키워드…"
};

function QuickSearchBlock({ scope }: { scope: AdminQuickSearchScope }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<QuickSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setMessage("");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ scope, q: trimmed });
      const response = await fetch(`/api/admin/quick-search?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as { results?: QuickSearchHit[]; message?: string };
      if (!response.ok) {
        setResults([]);
        setMessage(data.message ?? "검색에 실패했습니다.");
        return;
      }
      const list = data.results ?? [];
      setResults(list);
      setMessage(list.length === 0 ? "일치하는 항목이 없습니다." : "");
    } catch {
      setResults([]);
      setMessage("검색 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void runSearch(q);
    }, 320);
    return () => window.clearTimeout(t);
  }, [q, runSearch]);

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <label className="sr-only" htmlFor={`quick-search-${scope}`}>
        {PLACEHOLDER[scope]}
      </label>
      <Input
        id={`quick-search-${scope}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={PLACEHOLDER[scope]}
        autoComplete="off"
        className="h-9 text-xs"
      />
      {loading ? <p className="text-[11px] text-slate-500">검색 중…</p> : null}
      {!loading && message ? <p className="text-[11px] text-slate-500">{message}</p> : null}
      {results.length > 0 ? (
        <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/90 p-1.5 dark:border-slate-600 dark:bg-slate-900/80">
          {results.map((hit) => (
            <li key={hit.id}>
              <a
                href={hit.href}
                className="block rounded-md px-2 py-1.5 text-left text-[11px] leading-snug text-slate-800 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span className="font-bold">{hit.title}</span>
                <span className="mt-0.5 block text-slate-600 dark:text-slate-400">{hit.subtitle}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function AdminQuickNavHub() {
  const menuCards = useMemo(() => adminQuickNavCards(ADMIN_HOME_HREF), []);

  return (
    <section className="dk-admin-hub-intro mb-10">
      <h2 className="mb-1 text-lg font-black text-slate-900 dark:text-slate-50">빠른 이동</h2>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        사이드바 메뉴와 동일합니다. 카드 하단에서 등록·조회 항목을 바로 검색할 수 있습니다.
      </p>
      <div className={cn("dk-quick-nav-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3")}>
        {menuCards.map((menu) => {
          const Icon = menu.icon;
          const scope = adminQuickSearchScopeForHref(menu.href);
          return (
            <div
              key={menu.href}
              className={cn(
                "dk-quick-nav-card flex min-h-[200px] flex-col rounded-2xl border-2 border-slate-200 bg-white shadow-sm transition",
                "dark:border-slate-600 dark:bg-slate-950"
              )}
            >
              <Link
                href={menu.href}
                className={cn(
                  "group flex flex-1 flex-col p-5 pb-3 transition",
                  "hover:border-dk-navy/45 dark:hover:border-sky-500/40"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-dk-navy/10 text-dk-navy dark:bg-sky-500/15 dark:text-sky-300">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                </div>
                <span className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">{menu.label}</span>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{menu.description}</p>
                <span className="mt-3 text-xs font-semibold text-[#0a5eb0] group-hover:underline dark:text-sky-400">화면 열기 →</span>
              </Link>
              {scope ? (
                <div className="dk-quick-nav-card-footer mt-auto border-t border-slate-200 px-4 pb-4 pt-3 dark:border-slate-700">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">바로 조회</p>
                  <QuickSearchBlock scope={scope} />
                </div>
              ) : (
                <div className="dk-quick-nav-card-footer mt-auto border-t border-slate-100 px-4 pb-3 pt-2 dark:border-slate-800">
                  <p className="text-[10px] text-slate-500">단계 안내는 「화면 열기」에서 확인합니다.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import AdminApartmentsManager from "@/components/admin-apartments-manager";
import AdminApartmentManagersPanel from "@/components/admin/admin-apartment-managers-panel";
import { Card, CardContent } from "@/components/ui/card";
import AdminPageHeader from "@/components/admin/admin-page-header";

const TABS = [
  { key: "apartments", label: "아파트 단지 관리" },
  { key: "managers", label: "전기과장 계정 관리" }
] as const;

export default function AdminApartmentsPage() {
  // 단지 목록이 길어질수록 "전기과장 계정 관리"를 보려고 그 위 목록을 계속 스크롤해서
  // 지나쳐야 했던 문제(2026-08-25) — 같은 페이지에 쌓아두지 않고 탭으로 분리한다.
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("apartments");

  return (
    <main className="page-fit max-w-6xl">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition ${
              tab === t.key
                ? "border-dk-blue text-dk-blue"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "apartments" ? (
        <div className="mt-6">
          <AdminPageHeader title="아파트 단지 관리" description="단지 코드, 단지명, 계좌/기본료를 관리하는 관리자 화면입니다." />
          <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
            <CardContent className="pt-6">
              <AdminApartmentsManager />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="mt-6">
          <AdminPageHeader
            title="전기과장 계정 관리"
            description="세대전기점검 무료앱(inspect.dkansim.com) 가입신청 승인·비밀번호 재발급 화면입니다."
          />
          <Card className="border-slate-300 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/70">
            <CardContent className="pt-6">
              <AdminApartmentManagersPanel />
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

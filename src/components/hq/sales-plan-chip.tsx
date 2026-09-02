"use client";

import { useState } from "react";
import Link from "next/link";
import type { SalesPlanSummary } from "@/lib/sales-plan-summary";

/** hq 홈 요약스트립의 9-11월 영업계획 칩. salesPlan은 서버(hq-summary.ts)에서 계산돼 props로
 * 넘어오는 직렬화 가능한 평문 객체만 담는다(Date 금지). monthCount/monthTarget은 supplemental이
 * null이어도 항상 정상 표시된다(Principle 2) — 토글만 비활성화된다. */
export default function SalesPlanChip({
  salesPlan,
  campaignActive,
}: {
  salesPlan: SalesPlanSummary;
  campaignActive: boolean;
}) {
  const [showSupplemental, setShowSupplemental] = useState(false);
  const { monthCount, monthTarget, supplemental } = salesPlan;

  const canToggle = campaignActive && supplemental !== null;

  return (
    <div className="flex min-h-9 items-center gap-1">
      <button
        type="button"
        onClick={() => canToggle && setShowSupplemental((v) => !v)}
        disabled={!canToggle}
        className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg disabled:hover:bg-transparent"
      >
        영업계획
        {!campaignActive ? (
          <span className="text-slate-400">캠페인 종료</span>
        ) : showSupplemental && supplemental ? (
          <span className="text-slate-600">
            방문 {supplemental.visitCount} · 배포 {supplemental.freeDeployNew}
          </span>
        ) : (
          <span className={`rounded-full px-1.5 py-0.5 ${monthCount >= monthTarget ? "bg-cc-green/10 text-cc-green" : "bg-slate-100 text-slate-500"}`}>
            예약 {monthCount}/{monthTarget}건
          </span>
        )}
        {supplemental?.overBudget ? (
          <span className="rounded-full bg-cc-red/10 px-1.5 py-0.5 text-cc-red">예산초과</span>
        ) : null}
      </button>
      <Link
        href="/sales-visit-log"
        className="flex min-h-9 items-center rounded-full border border-slate-200 px-2 text-xs font-bold text-cc-text hover:bg-cc-bg"
      >
        + 기록
      </Link>
    </div>
  );
}

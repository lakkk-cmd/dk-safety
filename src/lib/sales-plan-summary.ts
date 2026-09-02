/** hq 9-11월 영업계획 현황판 집계 로직 — hq-summary.ts가 이 파일을 호출한다.
 * 설계 원칙(Principle 2, .omc/plans/hq-sales-plan-dashboard-2026-09.md): 절대기준인
 * monthCount/campaignCount는 순수 함수(countSalesPlanReservations)로 always 계산되고,
 * 실패 가능한 보조지표(방문기록/예산)만 getSalesPlanSupplemental()에서 별도로 격리한다. */

import { getKstDateTime } from "@/lib/agent-schedule";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";
import type { Reservation } from "@/lib/reservations-store";
import { pgCountVisitLogs } from "@/lib/sales-visit-log-pg";
import {
  SALES_PLAN_BUDGET_CAP,
  SALES_PLAN_CAMPAIGN_TARGET,
  SALES_PLAN_EXPENSE_TAG,
  SALES_PLAN_MONTH_TARGET,
  SALES_PLAN_RESERVATION_SOURCES,
  SALES_PLAN_WINDOW,
} from "@/lib/sales-plan-constants";

export type SalesPlanSupplemental = {
  visitCount: number;
  freeDeployNew: number;
  budgetUsed: number;
  budgetCap: number;
  overBudget?: boolean;
};

export type SalesPlanSummary = {
  monthCount: number;
  monthTarget: number;
  campaignCount: number;
  campaignTarget: number;
  supplemental: SalesPlanSupplemental | null;
};

/** 절대기준(신규 B2C 예약건수) — 순수 함수, I/O 없음, 실패할 수 없다.
 * 이미 로드된 reservations 배열을 재사용하므로 중복 조회가 없다. */
export function countSalesPlanReservations(
  reservations: Reservation[],
  now: Date
): { monthCount: number; campaignCount: number } {
  const nowKst = getKstDateTime(now);
  const monthKey = nowKst.dateKey.slice(0, 7);

  let monthCount = 0;
  let campaignCount = 0;

  for (const r of reservations) {
    if (r.status === "취소" || r.asSourceReservationId) continue;
    if (r.source !== undefined && !SALES_PLAN_RESERVATION_SOURCES.includes(r.source)) continue;

    const createdKst = getKstDateTime(new Date(r.createdAt));
    if (createdKst.dateKey < SALES_PLAN_WINDOW.start || createdKst.dateKey > SALES_PLAN_WINDOW.end) continue;

    campaignCount += 1;
    if (createdKst.dateKey.slice(0, 7) === monthKey) {
      monthCount += 1;
    }
  }

  return { monthCount, campaignCount };
}

/** 보조지표(방문기록/무료배포/예산) — 실패해도 null만 되고 위 절대기준엔 영향 없음. */
export async function getSalesPlanSupplemental(): Promise<SalesPlanSupplemental | null> {
  if (!isSupabaseReservationsDbReady()) return null;

  try {
    const supabase = requireSupabaseAdmin();
    const campaignStartTimestamp = `${SALES_PLAN_WINDOW.start}T00:00:00+09:00`;

    const [visitCount, freeDeployRes, expensesRes] = await Promise.all([
      pgCountVisitLogs(SALES_PLAN_WINDOW),
      supabase
        .from("apartments")
        .select("id", { count: "exact", head: true })
        .eq("partnership_type", "free_app")
        .gte("created_at", campaignStartTimestamp),
      supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", SALES_PLAN_WINDOW.start)
        .lte("expense_date", SALES_PLAN_WINDOW.end)
        // SALES_PLAN_EXPENSE_TAG는 뒤에 공백을 포함한 상수("[영업계획] ")인데, 메모가 빈
        // 채로 제출되면 쓰기측(sales-visit-log/page.tsx)의 마지막 .trim()이 그 공백을 잘라내
        // description이 "[영업계획]"(공백 없음)로 저장된다. 태그 자체를 trim()해 패턴을 만들면
        // 공백 유무와 무관하게 매칭되어, 실패가 "예산 0원 사용"으로 조용히 위장되는 걸 막는다.
        .ilike("description", `${SALES_PLAN_EXPENSE_TAG.trim()}%`),
    ]);

    if (freeDeployRes.error) throw new Error(`무료배포단지 조회 실패: ${freeDeployRes.error.message}`);
    if (expensesRes.error) throw new Error(`영업비 조회 실패: ${expensesRes.error.message}`);
    if (freeDeployRes.count === null) {
      // pgCountVisitLogs와 동일한 head:true count 함정 — null을 0으로 오인하지 않는다.
      throw new Error("무료배포단지 카운트 실패: count가 null입니다(테이블 접근 불가 가능성)");
    }

    const freeDeployNew = freeDeployRes.count;
    const budgetUsed = ((expensesRes.data ?? []) as { amount: number }[]).reduce(
      (sum, e) => sum + (e.amount ?? 0),
      0
    );

    return {
      visitCount,
      freeDeployNew,
      budgetUsed,
      budgetCap: SALES_PLAN_BUDGET_CAP,
      ...(budgetUsed > SALES_PLAN_BUDGET_CAP ? { overBudget: true } : {}),
    };
  } catch {
    return null;
  }
}

export async function getSalesPlanSummary(reservations: Reservation[], now = new Date()): Promise<SalesPlanSummary> {
  const { monthCount, campaignCount } = countSalesPlanReservations(reservations, now);
  const supplemental = await getSalesPlanSupplemental();
  return {
    monthCount,
    monthTarget: SALES_PLAN_MONTH_TARGET,
    campaignCount,
    campaignTarget: SALES_PLAN_CAMPAIGN_TARGET,
    supplemental,
  };
}

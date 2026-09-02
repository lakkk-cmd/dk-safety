import { NextResponse } from "next/server";
import { readReservations } from "@/lib/reservations-store";
import { getSalesPlanSummary } from "@/lib/sales-plan-summary";
import { notifySalesPlanProgress, KAKAO_MEMO_ENABLED } from "@/lib/kakao-publish";
import { getKstDateTime } from "@/lib/agent-schedule";
import { SALES_PLAN_WINDOW, SALES_PLAN_BUDGET_CAP } from "@/lib/sales-plan-constants";

export const maxDuration = 60;

const PIPELINE = "sales-plan-weekly";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const todayKstKey = getKstDateTime().dateKey;
    const campaignActive = todayKstKey >= SALES_PLAN_WINDOW.start && todayKstKey <= SALES_PLAN_WINDOW.end;
    if (!campaignActive) {
      // 캠페인(9-11월) 종료 후에는 "이번달 예약 0/10건"처럼 오해를 주는 알림을 매주 계속
      // 보내지 않는다 — 이 cron 자체를 vercel.json에서 지우는 건 별도 후속 정리로 남긴다.
      return NextResponse.json({ success: true, pipeline: PIPELINE, skipped: "campaign-window-ended" });
    }

    const reservations = await readReservations();
    const salesPlan = await getSalesPlanSummary(reservations);

    if (!KAKAO_MEMO_ENABLED) {
      return NextResponse.json({ success: true, pipeline: PIPELINE, skipped: "kakao-not-configured", salesPlan });
    }

    await notifySalesPlanProgress({
      monthCount: salesPlan.monthCount,
      monthTarget: salesPlan.monthTarget,
      budgetUsed: salesPlan.supplemental?.budgetUsed ?? null,
      budgetCap: salesPlan.supplemental?.budgetCap ?? SALES_PLAN_BUDGET_CAP,
    });

    return NextResponse.json({ success: true, pipeline: PIPELINE, salesPlan });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

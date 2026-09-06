import Link from "next/link";
import ActionItemsCard from "@/components/hq/action-items-card";
import HqImprovementInline from "@/components/hq/hq-improvement-inline";
import SystemHealthCard from "@/components/hq/system-health-card";
import DailyScanCard from "@/components/hq/daily-scan-card";
import SalesPlanChip from "@/components/hq/sales-plan-chip";
import { getHqSummary } from "@/lib/hq-summary";
import { getKstDateTime } from "@/lib/agent-schedule";
import { SALES_PLAN_WINDOW } from "@/lib/sales-plan-constants";
import { getLatestDailyBusinessScan, type DailyBusinessScan } from "@/lib/daily-scan";
import { getLatestSystemHealthReport, type SystemHealthReport } from "@/lib/system-health";
import { hqBasePath } from "@/lib/hq-links";

export const dynamic = "force-dynamic";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

/** 홈 = 자동화 상태판. 2026-09 재설계: 나열식 칩 리스트 대신 3단 위계로 재구성 —
 *  1) 오늘 수익(크게) 2) 이상신호(평소엔 조용, 문제 있을 때만 도드라짐) 3) 확인·결정 필요
 *  4) 배경 상태(파이프라인/스캔/헬스, 작게 · 평소엔 열어볼 필요 없음).
 *  AI 채팅은 별도 메뉴(/chat)로 분리됨(2026-08) — 홈은 순수 대시보드. */
export default async function HqPage() {
  const summary = await getHqSummary();
  const { reservations, content, pipeline, report, feedback, salesPlan } = summary;
  const base = await hqBasePath();
  const todayKstKey = getKstDateTime().dateKey;
  const campaignActive = todayKstKey >= SALES_PLAN_WINDOW.start && todayKstKey <= SALES_PLAN_WINDOW.end;

  // 이상신호 배너와 배경 카드가 같은 데이터를 쓰므로 한 번만 조회해 내려준다(중복 조회 방지).
  let dailyScan: DailyBusinessScan | null = null;
  let healthReport: SystemHealthReport | null = null;
  if (summary.agentSupabaseReady) {
    [dailyScan, healthReport] = await Promise.all([
      getLatestDailyBusinessScan().catch(() => null),
      getLatestSystemHealthReport().catch(() => null),
    ]);
  }

  const pipelineFailed = pipeline.latest?.status === "failed";
  const dailyAnomalyCount = dailyScan?.anomalies.length ?? 0;
  const healthFindingCount = healthReport?.findings.length ?? 0;
  const abnormalCount = (pipelineFailed ? 1 : 0) + dailyAnomalyCount + healthFindingCount;

  return (
    <div className="space-y-4">
      {/* 1순위 — 오늘 수익 */}
      <section className="cc-card p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">오늘 수익</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <Link href={`${base}/reservation`} className="text-3xl font-black text-cc-navy hover:underline">
            예약 {reservations.todayCount}건
          </Link>
          {reservations.unpaidCount > 0 ? (
            <span className="rounded-full bg-cc-gold px-2.5 py-1 text-sm font-bold text-cc-navy">
              미수금 {reservations.unpaidCount}건
            </span>
          ) : (
            <span className="text-sm font-bold text-cc-green">미수금 없음</span>
          )}
        </div>
        <div className="mt-3">
          <SalesPlanChip salesPlan={salesPlan} campaignActive={campaignActive} basePath={base} />
        </div>
      </section>

      {/* 2순위 — 이상신호. 평소엔 한 줄로 조용히, 문제가 있을 때만 눈에 띄게 커진다 */}
      {abnormalCount > 0 ? (
        <section className="cc-card border-2 border-cc-red/30 bg-cc-red/5 p-4">
          <p className="text-sm font-black text-cc-red">⚠ 확인이 필요한 이상신호 {abnormalCount}건</p>
          <ul className="mt-2 space-y-1 text-sm text-cc-text">
            {pipelineFailed ? (
              <li>
                · 파이프라인 실행 실패 — {pipeline.latest?.pipeline} ({formatDateTime(pipeline.latest!.started_at)})
              </li>
            ) : null}
            {dailyAnomalyCount > 0 ? <li>· 오늘 아침 스캔 이상신호 {dailyAnomalyCount}건 — 아래 &ldquo;오늘 아침 스캔&rdquo; 카드에서 확인</li> : null}
            {healthFindingCount > 0 ? <li>· 주간 시스템 점검 확인필요 {healthFindingCount}건 — 아래 &ldquo;주간 시스템 점검&rdquo; 카드에서 확인</li> : null}
          </ul>
        </section>
      ) : (
        <p className="px-1 text-sm font-bold text-cc-green">✅ 이상 신호 없음 — 파이프라인·아침 스캔·시스템 점검 전부 정상</p>
      )}

      {/* 3순위 — 확인·결정이 필요한 것 */}
      <section className="cc-card space-y-3 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">확인·결정이 필요한 것</p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://contents.dkansim.com"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg"
          >
            콘텐츠 승인대기
            <span className={`rounded-full px-1.5 py-0.5 ${content.pendingTotal > 0 ? "bg-cc-gold text-cc-navy" : "bg-slate-100 text-slate-500"}`}>
              {content.pendingTotal}
            </span>
          </a>
          {feedback.pending > 0 ? (
            <Link
              href={`${base}/report`}
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg"
            >
              대장 피드백 대기 <span className="rounded-full bg-cc-gold px-1.5 py-0.5 text-cc-navy">{feedback.pending}</span>
            </Link>
          ) : null}
          {content.pendingTotal === 0 && feedback.pending === 0 ? (
            <span className="text-xs text-slate-400">지금 대기 중인 승인·피드백 없음</span>
          ) : null}
        </div>
        <ActionItemsCard variant="inline" />
        <HqImprovementInline />
      </section>

      {/* 4순위 — 배경 상태. 평소엔 작고 조용히, 궁금할 때만 펼쳐본다 */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-400">
          <a href="https://agent.dkansim.com" target="_blank" rel="noreferrer" className="font-bold hover:text-slate-600 hover:underline">
            파이프라인 모니터
          </a>
          {pipeline.latest ? (
            <span>
              최근 실행: {formatDateTime(pipeline.latest.started_at)} · {pipeline.latest.status}
            </span>
          ) : (
            <span>파이프라인 이력 없음</span>
          )}
          <Link href={`${base}/report`} className="font-bold hover:text-slate-600 hover:underline">
            보고서 {report.latest ? report.latest.date_label : "없음"}
          </Link>
        </div>
        {summary.agentSupabaseReady ? <DailyScanCard report={dailyScan} /> : null}
        {summary.agentSupabaseReady ? <SystemHealthCard report={healthReport} /> : null}
      </section>
    </div>
  );
}

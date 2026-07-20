import Link from "next/link";
import HqChatClient from "./chat/chat-client";
import HqImprovementInline from "@/components/hq/hq-improvement-inline";
import SystemHealthCard from "@/components/hq/system-health-card";
import DailyScanCard from "@/components/hq/daily-scan-card";
import { getHqSummary } from "@/lib/hq-summary";

export const dynamic = "force-dynamic";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

/** 홈 = 예전 대시보드를 칩/배지로 압축한 요약 스트립 + AI채팅.
 *  사용자가 이미 채팅만 쓰고 나머지 탭은 방치한다고 밝혀, 채팅을 홈의 메인 화면으로 승격하고
 *  나머지 탭(콘텐츠/파이프라인/개선요청)은 삭제 — 필요한 배지는 agent./contents. 서브도메인이나
 *  남은 탭(예약/보고서)으로 바로 링크한다. */
export default async function HqPage() {
  const summary = await getHqSummary();
  const { reservations, content, pipeline, report, feedback } = summary;

  const pipelineStatusColor =
    pipeline.latest?.status === "success"
      ? "bg-cc-green/10 text-cc-green"
      : pipeline.latest?.status === "failed"
        ? "bg-cc-red/10 text-cc-red"
        : "bg-sky-100 text-sky-800";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="cc-card shrink-0 space-y-3 overflow-y-auto p-4 max-h-[45vh]">
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

          <a
            href="https://agent.dkansim.com"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg"
          >
            파이프라인
            {pipeline.latest ? (
              <span className={`rounded-full px-1.5 py-0.5 ${pipelineStatusColor}`}>{pipeline.latest.status}</span>
            ) : (
              <span className="text-slate-400">이력 없음</span>
            )}
          </a>

          <Link
            href="/reservation"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg"
          >
            오늘 예약 {reservations.todayCount}건
            {reservations.unpaidCount > 0 ? (
              <span className="rounded-full bg-cc-gold px-1.5 py-0.5 text-cc-navy">미수금 {reservations.unpaidCount}</span>
            ) : null}
          </Link>

          <Link
            href="/report"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg"
          >
            보고서
            {report.latest ? (
              <span className="text-slate-500">{report.latest.date_label}</span>
            ) : (
              <span className="text-slate-400">없음</span>
            )}
          </Link>

          {feedback.pending > 0 ? (
            <Link
              href="/report"
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold text-cc-text hover:bg-cc-bg"
            >
              대장 피드백 대기 <span className="rounded-full bg-cc-gold px-1.5 py-0.5 text-cc-navy">{feedback.pending}</span>
            </Link>
          ) : null}
        </div>

        {pipeline.latest ? (
          <p className="text-xs text-slate-400">최근 파이프라인: {formatDateTime(pipeline.latest.started_at)}</p>
        ) : null}

        <HqImprovementInline />
        {summary.agentSupabaseReady ? <DailyScanCard /> : null}
        {summary.agentSupabaseReady ? <SystemHealthCard /> : null}
      </section>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <HqChatClient />
      </div>
    </div>
  );
}

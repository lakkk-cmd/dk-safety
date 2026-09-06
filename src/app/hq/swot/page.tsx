import ActionItemsCard from "@/components/hq/action-items-card";
import SwotRegenerateButton from "@/components/hq/swot-regenerate-button";
import { getLatestSwotAnalysis, type SwotItem } from "@/lib/swot-analysis";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ko-KR");
}

function ItemList({ items }: { items: SwotItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">항목 없음</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
          <p className="text-sm font-bold text-cc-text">{item.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">{item.description}</p>
        </li>
      ))}
    </ul>
  );
}

function Quadrant({ label, tone, items }: { label: string; tone: string; items: SwotItem[] }) {
  return (
    <section className="cc-card p-4">
      <p className={`text-xs font-bold uppercase tracking-wide ${tone}`}>{label}</p>
      <div className="mt-2">
        <ItemList items={items} />
      </div>
    </section>
  );
}

/** SWOT 분석 + TOWS 전략 매트릭스 + 대표님 액션아이템 — 분기별 자동 재생성(2026-09-06 신설).
 *  체크리스트는 홈 화면과 같은 report_action_items 테이블을 공유한다(swot_analysis_id로 연결). */
export default async function SwotPage() {
  const analysis = await getLatestSwotAnalysis();

  if (!analysis) {
    return (
      <div className="cc-card space-y-3 p-6 text-center">
        <p className="text-sm text-slate-500">아직 생성된 SWOT/TOWS 분석이 없습니다.</p>
        <div className="flex justify-center">
          <SwotRegenerateButton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="cc-card flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{analysis.quarter_label} 전략 분석</p>
          <p className="mt-1 text-sm font-bold text-cc-navy">{analysis.summary}</p>
          <p className="mt-1 text-xs text-slate-400">생성: {formatDate(analysis.created_at)} · 다음 분기 자동 재생성</p>
        </div>
        <SwotRegenerateButton />
      </section>

      <section>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">1. SWOT 분석</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Quadrant label="강점 (내부)" tone="text-cc-green" items={analysis.strengths} />
          <Quadrant label="약점 (내부)" tone="text-cc-red" items={analysis.weaknesses} />
          <Quadrant label="기회 (외부)" tone="text-sky-600" items={analysis.opportunities} />
          <Quadrant label="위협 (외부)" tone="text-cc-gold" items={analysis.threats} />
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">2. TOWS 전략 매트릭스</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Quadrant label="SO — 강점으로 기회 극대화" tone="text-cc-green" items={analysis.tows_so} />
          <Quadrant label="WO — 약점 보완해 기회 활용" tone="text-sky-600" items={analysis.tows_wo} />
          <Quadrant label="ST — 강점으로 위협 회피" tone="text-cc-gold" items={analysis.tows_st} />
          <Quadrant label="WT — 약점·위협 동시 극복" tone="text-cc-red" items={analysis.tows_wt} />
        </div>
      </section>

      <section>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">3. 대표님이 해야할 목록</p>
        <ActionItemsCard variant="panel" />
      </section>
    </div>
  );
}

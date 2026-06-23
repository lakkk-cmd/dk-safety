import { BigButton } from "@/components/ui/big-button";
import { StatusBadge, type RiskLevel } from "@/components/ui/status-badge";
import { SectionCard } from "@/components/ui/section-card";
import { StepProgress } from "@/components/ui/step-progress";
import { EmptyState } from "@/components/ui/empty-state";
import OverlayDemo from "./overlay-demo";

const RISK_LEVELS: RiskLevel[] = ["안전", "주의", "경고", "위험"];

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-md space-y-8 bg-dk-gray p-4 pb-16">
      <h1 className="pt-4 text-2xl font-bold text-dk-navy">디자인 시스템</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-dk-navy">StepProgress</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <StepProgress steps={["분전반", "차단기", "콘센트/배선", "종합판정"]} current={1} sticky={false} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-dk-navy">StatusBadge</h2>
        <div className="flex flex-wrap gap-2">
          {RISK_LEVELS.map((level) => (
            <StatusBadge key={`sm-${level}`} level={level} size="sm" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {RISK_LEVELS.map((level) => (
            <StatusBadge key={`md-${level}`} level={level} size="md" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {RISK_LEVELS.map((level) => (
            <StatusBadge key={`lg-${level}`} level={level} size="lg" />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-dk-navy">BigButton</h2>
        <BigButton variant="primary" icon="🔴">
          지금 점검 예약하기
        </BigButton>
        <BigButton variant="secondary" icon="📋">
          내 점검 결과 보기
        </BigButton>
        <BigButton variant="danger" icon="🚨">
          긴급 출동 요청
        </BigButton>
        <BigButton variant="ghost" icon="←">
          뒤로가기
        </BigButton>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-dk-navy">SectionCard</h2>
        <SectionCard icon="📋" title="점검 요약" action={<button className="text-sm font-bold text-dk-blue">수정</button>}>
          <p className="text-[15px] text-slate-600">점검일: 2026-06-23 · 기사: 나경문</p>
        </SectionCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-dk-navy">EmptyState</h2>
        <EmptyState
          icon="📭"
          title="아직 예약이 없어요"
          description="지금 바로 점검을 예약해보세요."
          action={
            <BigButton variant="primary" icon="🔴">
              지금 예약하기
            </BigButton>
          }
        />
      </section>

      <OverlayDemo />
    </main>
  );
}

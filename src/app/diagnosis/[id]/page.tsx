import Link from "next/link";
import { notFound } from "next/navigation";
import { pgGetFieldReportPublic } from "@/lib/field-reports";
import { pgGetWorkerById } from "@/lib/reservations-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { StatusBadge, type RiskLevel } from "@/components/ui/status-badge";
import { SectionCard } from "@/components/ui/section-card";

const RISK_LEVELS: readonly string[] = ["안전", "주의", "경고", "위험"];

function buildFindings(report: NonNullable<Awaited<ReturnType<typeof pgGetFieldReportPublic>>>): string[] {
  const findings: string[] = [];
  if (report.leakageDetected) findings.push("🔴 누전이 감지되었습니다" + (report.leakagePathNote ? ` (${report.leakagePathNote})` : ""));
  if (report.outletOverheat) findings.push("🔴 콘센트 과열이 확인되었습니다" + (report.outletOverheatNote ? ` (${report.outletOverheatNote})` : ""));
  if (report.wiringDamage) findings.push("🟠 배선 손상/노출이 확인되었습니다" + (report.wiringDamageNote ? ` (${report.wiringDamageNote})` : ""));
  if (report.breakerVisualStatus === "교체필요" || report.breakerVisualStatus === "소손") {
    findings.push("🟠 차단기 교체가 필요합니다");
  }
  if (findings.length === 0) findings.push("✅ 특이사항이 발견되지 않았습니다");
  return findings.slice(0, 3);
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) notFound();
  const { id } = await params;
  const report = await pgGetFieldReportPublic(id);
  if (!report || report.status !== "completed") notFound();

  const worker = report.workerId ? await pgGetWorkerById(report.workerId).catch(() => null) : null;
  const findings = buildFindings(report);
  const riskLevel = (RISK_LEVELS.includes(report.riskLevel ?? "") ? report.riskLevel : null) as RiskLevel | null;

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-dk-gray p-4 pb-16">
      <div className="pt-4 text-center">{riskLevel ? <StatusBadge level={riskLevel} size="lg" /> : null}</div>

      <SectionCard icon="📋" title="점검 요약">
        <dl className="space-y-1.5 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-slate-500">점검일</dt>
            <dd className="font-semibold text-slate-800">{new Date(report.inspectedAt).toLocaleDateString("ko-KR")}</dd>
          </div>
          {worker ? (
            <div className="flex justify-between">
              <dt className="text-slate-500">점검 기사</dt>
              <dd className="font-semibold text-slate-800">{worker.name}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-slate-500">세대주소</dt>
            <dd className="text-right font-semibold text-slate-800">{report.apartmentAddress}</dd>
          </div>
        </dl>

        <p className="mb-2 mt-4 text-sm font-bold text-slate-800">주요 발견 사항</p>
        <ul className="space-y-1.5">
          {findings.map((finding) => (
            <li key={finding} className="text-[15px] text-slate-700">
              {finding}
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="flex gap-2">
        {report.pdfResidentUrl ? (
          <a
            href={report.pdfResidentUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 min-h-14 items-center justify-center gap-2 rounded-2xl bg-dk-blue px-3 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
          >
            📄 거주자 안전 가이드
          </a>
        ) : null}
        {report.pdfLandlordUrl ? (
          <a
            href={report.pdfLandlordUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dk-navy bg-white px-3 text-[15px] font-bold text-dk-navy"
          >
            📋 집주인 전문 보고서
          </a>
        ) : null}
      </div>

      <SectionCard icon="⭐" title="후기 부탁드려요">
        <p className="text-[15px] text-slate-600">솔직한 후기 한 줄이 큰 힘이 됩니다.</p>
        <a
          href="https://search.naver.com"
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-12 items-center justify-center rounded-2xl border-2 border-dk-gold text-[15px] font-bold text-dk-navy"
        >
          ⭐ 네이버 후기 남기기
        </a>
      </SectionCard>

      <Link
        href="/home"
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dk-navy bg-white px-5 text-base font-bold text-dk-navy"
      >
        📅 다음 점검 예약하기
      </Link>
    </main>
  );
}

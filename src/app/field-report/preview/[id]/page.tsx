import Link from "next/link";
import { redirect } from "next/navigation";
import { pgGetFieldReportForWorker } from "@/lib/field-reports";
import { getWorkerIdFromCookies } from "@/lib/worker-session-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import WorkerChrome from "@/components/worker/worker-chrome";
import FieldReportOpinionPanel from "@/components/worker/field-report-opinion-panel";
import FieldReportPipelineButton from "@/components/worker/field-report-pipeline-button";

const FIELD_REPORT_STATUS_LABEL: Record<string, string> = {
  draft: "임시저장",
  submitted: "제출 완료",
  opinion_generated: "AI 소견 생성됨",
  pdf_generated: "PDF 생성됨",
  completed: "발송 완료"
};

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <p className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </p>
  );
}

export default async function FieldReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    redirect("/worker/login?reason=db");
  }
  const workerId = await getWorkerIdFromCookies();
  if (!workerId) {
    redirect("/worker/login");
  }
  const { id } = await params;
  const report = await pgGetFieldReportForWorker(id, workerId);

  if (!report) {
    return (
      <WorkerChrome workerId={workerId}>
        <p className="text-sm text-rose-700">기록을 찾을 수 없습니다.</p>
        <Link href="/worker" className="mt-3 inline-flex text-sm font-semibold text-blue-700">
          목록으로
        </Link>
      </WorkerChrome>
    );
  }

  return (
    <WorkerChrome workerId={workerId}>
      <div className="space-y-4">
        <Link href="/worker" className="inline-flex text-sm font-semibold text-blue-700">
          목록으로
        </Link>

        <div className="warranty-band rounded-2xl p-4">
          <p className="warranty-badge">현장 점검 기록</p>
          <p className="mt-2 text-lg font-black text-slate-900">{report.apartmentAddress}</p>
          <p className="mt-1 text-xs text-slate-600">점검일시: {new Date(report.inspectedAt).toLocaleString("ko-KR")}</p>
          <p className="mt-1 text-xs text-slate-500">상태: {FIELD_REPORT_STATUS_LABEL[report.status] ?? report.status}</p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black text-slate-900">분전반 계측값</h2>
          <div className="mt-2">
            <Row label="누전차단기 동작 전류" value={report.breakerTripCurrentMa != null ? `${report.breakerTripCurrentMa}mA` : null} />
            <Row label="주 차단기 용량" value={report.mainBreakerCapacityA != null ? `${report.mainBreakerCapacityA}A` : null} />
            <Row label="절연저항값" value={report.insulationResistanceMohm != null ? `${report.insulationResistanceMohm}MΩ` : null} />
            <Row label="누전 발생 여부" value={report.leakageDetected ? "YES" : "NO"} />
            <Row label="누전 추정 경로" value={report.leakagePathNote} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black text-slate-900">차단기 상태</h2>
          <div className="mt-2">
            <Row label="제조연도" value={report.breakerYear} />
            <Row label="육안 상태" value={report.breakerVisualStatus} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black text-slate-900">콘센트/배선 상태</h2>
          <div className="mt-2">
            <Row label="전용면적" value={report.unitAreaSqm != null ? `${report.unitAreaSqm}㎡` : null} />
            <Row label="콘센트 과열" value={report.outletOverheat ? `YES (${report.outletOverheatNote || "메모 없음"})` : "NO"} />
            <Row label="배선 노출/손상" value={report.wiringDamage ? `YES (${report.wiringDamageNote || "메모 없음"})` : "NO"} />
            <Row label="접지 연결 상태" value={report.groundingStatus} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-black text-slate-900">종합 위험도</h2>
          <div className="mt-2">
            <Row label="위험등급" value={report.riskLevel} />
            <Row label="긴급 교체 필요 부품" value={report.urgentParts.length > 0 ? report.urgentParts.join(", ") : "없음"} />
          </div>
          {report.siteMemo ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{report.siteMemo}</p> : null}
        </section>

        {report.photoUrls.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-black text-slate-900">첨부 사진</h2>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {report.photoUrls.map((url, idx) => (
                <li key={`${url}-${idx}`} className="overflow-hidden rounded-lg border border-slate-200">
                  <a href={url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`분전반 ${idx + 1}`} className="h-20 w-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <FieldReportPipelineButton fieldReportId={report.id} />

        <FieldReportOpinionPanel
          fieldReportId={report.id}
          initialLandlord={report.opinionLandlord}
          initialResident={report.opinionResident}
          initialPdfLandlordUrl={report.pdfLandlordUrl}
          initialPdfResidentUrl={report.pdfResidentUrl}
        />
      </div>
    </WorkerChrome>
  );
}

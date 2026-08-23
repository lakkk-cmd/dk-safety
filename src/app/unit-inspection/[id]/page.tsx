import Link from "next/link";
import { notFound } from "next/navigation";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgGetUnitInspectionPublic } from "@/lib/unit-inspections";
import { StatusBadge, type RiskLevel } from "@/components/ui/status-badge";
import { SectionCard } from "@/components/ui/section-card";
import SiteFooter from "@/components/site-footer";

function verdictLevel(badCount: number): RiskLevel {
  if (badCount === 0) return "안전";
  if (badCount === 1) return "주의";
  if (badCount === 2) return "경고";
  return "위험";
}

export default async function UnitInspectionPublicPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) notFound();
  const { id } = await params;
  const inspection = await pgGetUnitInspectionPublic(id);
  if (!inspection) notFound();

  const apartment = await pgFindApartmentByIdentifier(inspection.apartmentId).catch(() => null);
  const badCount = inspection.autoDiagnosis.length;
  const level = verdictLevel(badCount);
  const inspectedAtLabel = new Date(inspection.inspectedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 bg-dk-gray p-4 pb-16">
      <div className="pt-4 text-center">
        <StatusBadge level={level} size="lg" />
      </div>

      <SectionCard icon="⚡" title="세대전기점검(직무고시) 결과">
        <dl className="space-y-1.5 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-slate-500">점검일</dt>
            <dd className="font-semibold text-slate-800">{inspectedAtLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">단지</dt>
            <dd className="font-semibold text-slate-800">{apartment?.name ?? "-"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">세대</dt>
            <dd className="font-semibold text-slate-800">
              {inspection.dong}동 {inspection.ho}호
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">점검 유형</dt>
            <dd className="font-semibold text-slate-800">
              {inspection.inspectionType === "visit" ? "세대방문점검" : "세대미방문 간이점검"}
            </dd>
          </div>
        </dl>

        <p className="mb-2 mt-4 text-sm font-bold text-slate-800">자동 안전진단</p>
        {badCount === 0 ? (
          <p className="text-[15px] text-slate-700">✅ 부적합 항목이 발견되지 않았습니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {inspection.autoDiagnosis.map((entry, idx) => (
              <li key={idx} className="rounded-xl border border-dk-red/30 bg-dk-red/5 p-3">
                <p className="text-sm font-bold text-dk-red">{entry.item}</p>
                <p className="mt-1 text-[13px] text-slate-600">{entry.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {inspection.pdfUrl ? (
        <a
          href={inspection.pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-dk-blue px-3 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(26,92,255,0.28)]"
        >
          📄 점검기록표 PDF 보기
        </a>
      ) : null}

      {badCount > 0 ? (
        <SectionCard icon="🔧" title="지금 신청하면 바로 도와드려요">
          <p className="text-[15px] text-slate-600">
            부적합 항목은 감전·화재 위험과 전기 요금 추가부담으로 이어질 수 있어요. 우리집 전기주치의가 빠르게 수리해 드릴게요.
          </p>
          <div className="mt-3 flex gap-2">
            <a
              href="tel:010-8945-1111"
              className="flex flex-1 min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dk-navy bg-white px-3 text-[15px] font-bold text-dk-navy"
            >
              📞 바로 전화
            </a>
            <Link
              href="/reservation"
              className="flex flex-1 min-h-14 items-center justify-center gap-2 rounded-2xl bg-dk-red px-3 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(229,62,62,0.28)]"
            >
              🛠️ 수리 예약하기
            </Link>
          </div>
        </SectionCard>
      ) : (
        <Link
          href="/reservation"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dk-navy bg-white px-5 text-base font-bold text-dk-navy"
        >
          🏠 다른 전기 문제도 상담받기
        </Link>
      )}

      <SiteFooter />
    </main>
  );
}

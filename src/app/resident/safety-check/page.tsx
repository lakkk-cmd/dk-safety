import Link from "next/link";
import { Suspense } from "react";
import SafetyDiagnosisForm from "@/components/resident/safety-diagnosis-form";

export default async function ResidentSafetyCheckPage({
  searchParams
}: {
  searchParams?: Promise<{ tenant?: string | string[] }>;
}) {
  const sp = (await searchParams) ?? {};
  const tenantRaw = sp.tenant;
  const tenant =
    typeof tenantRaw === "string"
      ? tenantRaw.trim()
      : Array.isArray(tenantRaw)
        ? tenantRaw[0]?.trim()
        : undefined;
  const backHref = tenant ? `/apt/${encodeURIComponent(tenant)}` : "/home";

  return (
    <main className="page-fit max-w-5xl">
      <nav className="mb-3" aria-label="이전 화면으로 이동">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300/90 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-primary/35 hover:bg-slate-50"
        >
          <span aria-hidden>←</span>
          뒤로가기
        </Link>
      </nav>
      <section className="warranty-band mb-3 overflow-hidden rounded-[1.25rem] p-[clamp(0.8rem,2vh,1.25rem)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[clamp(1.65rem,4.4vw,2.25rem)] font-black tracking-[-0.02em] text-slate-900">초간단 6문항 자가진단</h1>
            <p className="mt-1 text-sm leading-snug text-slate-700">질문 6개로 빠르게 위험도를 확인해요.</p>
          </div>
        </div>
      </section>
      <Suspense fallback={<section className="surface-card rounded-2xl p-5 text-sm text-slate-600">자가진단 화면을 불러오는 중입니다...</section>}>
        <SafetyDiagnosisForm />
      </Suspense>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { pgFindWarrantyByNumber } from "@/lib/warranty-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import DigitalWarrantyArtifact from "@/components/warranty/digital-warranty-artifact";

export const dynamic = "force-dynamic";

export default async function WarrantyVerifyPage({
  params
}: {
  params: Promise<{ warranty_number: string }>;
}) {
  if (!isSupabaseReservationsDbReady()) notFound();
  const { warranty_number } = await params;
  const warranty = await pgFindWarrantyByNumber(warranty_number);
  if (!warranty) notFound();

  return (
    <main className="page-fit max-w-4xl space-y-4">
      <section className="warranty-band rounded-3xl p-5">
        <p className="warranty-badge">안심 보증서 확인</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">보증서 번호: {warranty.warrantyNumber}</h1>
        <p className={`mt-2 text-sm font-bold ${warranty.status === "ISSUED" ? "text-emerald-700" : "text-rose-700"}`}>
          {warranty.status === "ISSUED" ? "정상 발급된 보증서입니다." : "유효하지 않은 보증 상태입니다."}
        </p>
      </section>
      <DigitalWarrantyArtifact warranty={warranty} />

      <div className="text-center">
        <Link href="/home" className="btn-outline inline-flex px-4 py-2 text-sm">
          홈으로 이동
        </Link>
      </div>
    </main>
  );
}

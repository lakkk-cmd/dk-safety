import { readPricingCatalog, formatPricingCatalogFee } from "@/lib/pricing-catalog";
import { pricingGuideNotice } from "@/lib/pricing-guide";

type Props = {
  compact?: boolean;
};

/** DB `payment_settings.pricing_catalog` + `base_dispatch_fee`와 동일한 금액을 표시합니다. */
export default async function PricingGuideCard({ compact = false }: Props) {
  const lines = await readPricingCatalog();

  return (
    <section className="surface-card-strong rounded-3xl p-6 md:p-8">
      <div className="mb-4">
        <p className="section-kicker">요금 안내</p>
        <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">장비/교체/점검 요금 기준</h3>
      </div>
      <div className={`grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {lines.map((item) => (
          <article key={item.key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold text-slate-900">{item.title}</p>
            <p className="mt-1 text-lg font-extrabold text-primary">{formatPricingCatalogFee(item.amount)}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.detail}</p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">{pricingGuideNotice}</p>
    </section>
  );
}

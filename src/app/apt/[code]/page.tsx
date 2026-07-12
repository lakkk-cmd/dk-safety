import { notFound } from "next/navigation";
import { pgFindApartmentByCode } from "@/lib/apartments-pg";
import ApartmentMainActions, { type ElectricalTipPublic } from "@/components/reservation/apartment-main-actions";
import { readPaymentSettings } from "@/lib/payment-settings";
import { isSupabaseReservationsDbReady, requireSupabaseAdmin } from "@/lib/supabase-pg";

function firstQuery(v: string | string[] | undefined): string {
  if (v == null) return "";
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function ApartmentHomePage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  if (!isSupabaseReservationsDbReady()) notFound();
  const apartment = await pgFindApartmentByCode(code);
  if (!apartment) notFound();
  const sp = (await searchParams) ?? {};
  const urlProfile = {
    dong: firstQuery(sp.dong).replaceAll(/[^0-9]/g, ""),
    ho: firstQuery(sp.ho).replaceAll(/[^0-9]/g, ""),
    name: firstQuery(sp.name).trim(),
    phone: firstQuery(sp.phone).replaceAll(/[^0-9]/g, "").slice(0, 11)
  };

  const paymentSettings = await readPaymentSettings();

  let electricalTips: ElectricalTipPublic[] = [];
  try {
    const supabase = requireSupabaseAdmin();
    const { data, error } = await supabase
      .from("electrical_tips")
      .select("id, category, title, summary, content, service_type")
      .eq("is_published", true)
      .order("display_order", { ascending: true })
      .limit(6);
    if (!error && data) {
      electricalTips = data as ElectricalTipPublic[];
    }
  } catch {
    electricalTips = [];
  }

  return (
    <ApartmentMainActions
      apartment={apartment}
      urlProfile={urlProfile}
      electricalTips={electricalTips}
      simpleSwapFee={paymentSettings.simpleSwapFee}
    />
  );
}

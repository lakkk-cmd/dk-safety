import { notFound } from "next/navigation";
import { pgFindApartmentByCode } from "@/lib/apartments-pg";
import { readPaymentSettings } from "@/lib/payment-settings";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import ServiceRequestPage from "@/components/reservation/service-request-page";

export default async function ApartmentRepairPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isSupabaseReservationsDbReady()) notFound();
  const apartment = await pgFindApartmentByCode(code);
  if (!apartment) notFound();
  const paymentSettings = await readPaymentSettings();
  return <ServiceRequestPage apartment={apartment} requestType="repair" baseDispatchFee={paymentSettings.baseDispatchFee} />;
}

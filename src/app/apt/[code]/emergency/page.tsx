import { notFound } from "next/navigation";
import { pgFindApartmentByCode } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { readEmergencyDispatchFee } from "@/lib/pricing-catalog";
import ServiceRequestPage from "@/components/reservation/service-request-page";

export default async function ApartmentEmergencyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isSupabaseReservationsDbReady()) notFound();
  const apartment = await pgFindApartmentByCode(code);
  if (!apartment) notFound();
  const emergencyDispatchFee = await readEmergencyDispatchFee();
  return <ServiceRequestPage apartment={apartment} requestType="emergency" emergencyDispatchFee={emergencyDispatchFee} />;
}

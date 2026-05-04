import { notFound, redirect } from "next/navigation";
import { pgFindApartmentByIdentifier } from "@/lib/apartments-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export const dynamic = "force-dynamic";

export default async function ApartmentIdentifierEntryPage({
  params
}: {
  params: Promise<{ apt_id: string }>;
}) {
  const { apt_id } = await params;
  if (!apt_id || apt_id.includes(".") || apt_id.length > 80) notFound();
  if (!isSupabaseReservationsDbReady()) notFound();

  const apartment = await pgFindApartmentByIdentifier(apt_id);
  if (!apartment) notFound();

  redirect(`/apt/${apartment.code}`);
}

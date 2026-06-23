import { redirect } from "next/navigation";
import { getWorkerIdFromCookies } from "@/lib/worker-session-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import WorkerChrome from "@/components/worker/worker-chrome";
import FieldReportWizard from "@/components/worker/field-report-wizard";

export default async function FieldReportPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSupabaseReservationsDbReady()) {
    redirect("/worker/login?reason=db");
  }
  const workerId = await getWorkerIdFromCookies();
  if (!workerId) {
    redirect("/worker/login");
  }
  const sp = (await searchParams) ?? {};
  const reservationIdRaw = sp.reservationId;
  const reservationId = (Array.isArray(reservationIdRaw) ? reservationIdRaw[0] : reservationIdRaw)?.trim() || undefined;

  return (
    <WorkerChrome workerId={workerId}>
      <FieldReportWizard presetReservationId={reservationId} />
    </WorkerChrome>
  );
}

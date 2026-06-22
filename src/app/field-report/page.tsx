import { redirect } from "next/navigation";
import { getWorkerIdFromCookies } from "@/lib/worker-session-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import WorkerChrome from "@/components/worker/worker-chrome";
import FieldReportForm from "@/components/worker/field-report-form";

export default async function FieldReportPage() {
  if (!isSupabaseReservationsDbReady()) {
    redirect("/worker/login?reason=db");
  }
  const workerId = await getWorkerIdFromCookies();
  if (!workerId) {
    redirect("/worker/login");
  }
  return (
    <WorkerChrome workerId={workerId}>
      <FieldReportForm />
    </WorkerChrome>
  );
}

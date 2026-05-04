import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import WorkerChrome from "@/components/worker/worker-chrome";
import { getWorkerIdFromCookies } from "@/lib/worker-session-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export default async function WorkerDashboardLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseReservationsDbReady()) {
    redirect("/worker/login?reason=db");
  }
  const workerId = await getWorkerIdFromCookies();
  if (!workerId) {
    redirect("/worker/login");
  }
  return <WorkerChrome workerId={workerId}>{children}</WorkerChrome>;
}

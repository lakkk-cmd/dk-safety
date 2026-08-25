import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AptManagerChrome from "@/components/apt-manager/apt-manager-chrome";
import { getApartmentManagerIdFromCookies } from "@/lib/apt-manager-session-server";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export default async function AptManagerDashboardLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseReservationsDbReady()) {
    redirect("/apt-manager/login?reason=db");
  }
  const managerId = await getApartmentManagerIdFromCookies();
  if (!managerId) {
    redirect("/apt-manager/login");
  }
  return <AptManagerChrome>{children}</AptManagerChrome>;
}

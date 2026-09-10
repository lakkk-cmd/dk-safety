import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listCrmRegisteredViaOptions, listCustomerSummary } from "@/lib/crm-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const search = req.nextUrl.searchParams.get("q") ?? undefined;
  const page = Number.parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1;
  const pageSize = Number.parseInt(req.nextUrl.searchParams.get("pageSize") ?? "10", 10) || 10;
  const registeredVia = req.nextUrl.searchParams.get("via") ?? undefined;
  try {
    const [result, viaOptions] = await Promise.all([
      listCustomerSummary({ search, page, pageSize, registeredVia }),
      listCrmRegisteredViaOptions()
    ]);
    return NextResponse.json({ ...result, viaOptions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

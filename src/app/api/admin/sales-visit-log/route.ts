import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { pgCreateVisitLog, pgListVisitLogs } from "@/lib/sales-visit-log-pg";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const entries = await pgListVisitLogs();
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json();
    if (!body.apartmentName || !body.outcome) {
      return NextResponse.json({ error: "apartmentName, outcome은 필수입니다" }, { status: 400 });
    }
    const entry = await pgCreateVisitLog({
      apartmentName: body.apartmentName,
      visitDate: body.visitDate,
      outcome: body.outcome,
      memo: body.memo ?? null,
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
    });
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

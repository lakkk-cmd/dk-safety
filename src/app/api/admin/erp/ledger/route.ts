import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listLedgerEntries, createManualLedgerEntry } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const entries = await listLedgerEntries({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
      category: req.nextUrl.searchParams.get("category") ?? undefined,
      sourceType: req.nextUrl.searchParams.get("sourceType") ?? undefined
    });
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
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "금액이 올바르지 않습니다." }, { status: 400 });
    }
    if (!body.entry_date || !body.category) {
      return NextResponse.json({ error: "날짜와 항목명은 필수입니다." }, { status: 400 });
    }
    const entry = await createManualLedgerEntry({
      entry_date: body.entry_date,
      category: body.category,
      amount,
      description: body.description ?? null,
      reservation_id: body.reservation_id ?? null
    });
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

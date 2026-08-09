import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { deleteLedgerEntry, updateLedgerEntry } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const { id } = await context.params;
  try {
    const body = await req.json();
    const amount = body.amount !== undefined ? Number(body.amount) : undefined;
    const entry = await updateLedgerEntry(id, {
      entry_date: typeof body.entry_date === "string" ? body.entry_date : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      amount,
      description: body.description !== undefined ? (body.description || null) : undefined
    });
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const { id } = await context.params;
  try {
    await deleteLedgerEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

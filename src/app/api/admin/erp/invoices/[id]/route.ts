import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { updateInvoiceStatus, getInvoice } from "@/lib/erp-db";
import type { Invoice } from "@/lib/erp-db";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });
  const { id } = await context.params;
  try {
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "없음" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const { id } = await context.params;
  try {
    const { status } = await req.json() as { status: Invoice["status"] };
    await updateInvoiceStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

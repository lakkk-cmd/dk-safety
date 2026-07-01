import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listInvoices, createInvoice } from "@/lib/erp-db";
import type { InvoiceItem } from "@/lib/erp-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  try {
    const invoices = await listInvoices({ status, type });
    return NextResponse.json({ invoices });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json() as {
      customer_name: string;
      customer_phone?: string;
      customer_business_number?: string;
      customer_address?: string;
      items: InvoiceItem[];
      type?: string;
      due_at?: string;
      reservation_id?: string;
    };

    const items: InvoiceItem[] = (body.items ?? []).map((item) => ({
      description: item.description,
      qty: Number(item.qty),
      unit_price: Number(item.unit_price),
      amount: Number(item.qty) * Number(item.unit_price),
    }));
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const invoiceType = (body.type ?? "receipt") as "tax_invoice" | "receipt" | "quote";
    const tax = invoiceType === "tax_invoice" ? Math.round(subtotal * 0.1) : 0;
    const total = subtotal + tax;

    const invoice = await createInvoice({
      customer_name: body.customer_name,
      customer_phone: body.customer_phone ?? null,
      customer_business_number: body.customer_business_number ?? null,
      customer_address: body.customer_address ?? null,
      items,
      subtotal,
      tax,
      total,
      type: invoiceType,
      status: "draft",
      issued_at: new Date().toISOString(),
      due_at: body.due_at ?? null,
      reservation_id: body.reservation_id ?? null,
      pdf_url: null,
    });
    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

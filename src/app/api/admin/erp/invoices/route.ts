import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listInvoices, createInvoice } from "@/lib/erp-db";
import type { InvoiceItem } from "@/lib/erp-db";
import { validateInvoice, GEMINI_ENABLED } from "@/lib/cross-validate";

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

    // 수학 계산 오류는 Gemini 없이도 항상 검증. Gemini 품질 검증은 GEMINI_API_KEY가 있을 때만 수행.
    try {
      const validation = await validateInvoice({
        type: invoiceType,
        customerName: body.customer_name,
        items: items.map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit_price, amount: i.amount })),
        subtotal,
        tax,
        total,
      });
      if (!validation.passed || validation.errors.length > 0) {
        return NextResponse.json(
          { error: "청구서 검증 실패", errors: validation.errors, reason: validation.reason },
          { status: 422 }
        );
      }
    } catch (validationErr) {
      if (GEMINI_ENABLED) throw validationErr;
      // Gemini 미설정: 수학 검증은 오류 발생 시 이미 위에서 반환되었으므로 여기 도달 시 계속 진행
    }

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

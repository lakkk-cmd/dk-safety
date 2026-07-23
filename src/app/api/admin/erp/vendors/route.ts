import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listVendors, createVendor, getVendorSpendTotals } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const [vendors, spendTotals] = await Promise.all([listVendors(), getVendorSpendTotals()]);
    const spendByVendor = new Map(spendTotals.map((s) => [s.vendorId, s.total]));
    return NextResponse.json({
      vendors: vendors.map((v) => ({ ...v, totalSpend: spendByVendor.get(v.id) ?? 0 }))
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "거래처명은 필수입니다." }, { status: 400 });
    const vendor = await createVendor({
      name,
      business_number: body.business_number || null,
      phone: body.phone || null,
      category: body.category || null,
      note: body.note || null
    });
    return NextResponse.json({ vendor });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { getBudgetProgress, upsertBudget } from "@/lib/financial-ledger";

export const dynamic = "force-dynamic";

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const month = req.nextUrl.searchParams.get("month") ?? thisMonth();
  try {
    const progress = await getBudgetProgress(month);
    return NextResponse.json({ month, progress });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  try {
    const body = await req.json();
    const plannedAmount = Number(body.planned_amount);
    if (!body.month || !body.category || !Number.isFinite(plannedAmount) || plannedAmount < 0) {
      return NextResponse.json({ error: "월/항목/예산금액을 확인해주세요." }, { status: 400 });
    }
    const budget = await upsertBudget({ month: body.month, category: body.category, planned_amount: Math.round(plannedAmount) });
    return NextResponse.json({ budget });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

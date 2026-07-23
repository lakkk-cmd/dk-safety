import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { listExpenses, createExpense, getExpenseStats } from "@/lib/erp-db";
import { validateExpense, GEMINI_ENABLED } from "@/lib/cross-validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseReservationsDbReady()) return NextResponse.json({ error: "Supabase DB 미연결" }, { status: 503 });

  const month = req.nextUrl.searchParams.get("month") ?? undefined;
  const statsOnly = req.nextUrl.searchParams.get("stats") === "1";
  try {
    if (statsOnly) {
      const stats = await getExpenseStats(6);
      return NextResponse.json(stats);
    }
    const expenses = await listExpenses({ month });
    return NextResponse.json({ expenses });
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

    if (GEMINI_ENABLED) {
      const validation = await validateExpense({
        category: body.category,
        amount,
        description: body.description ?? null,
        paymentMethod: body.payment_method ?? "카드",
        expenseDate: body.expense_date,
      });
      if (!validation.passed) {
        return NextResponse.json({ error: `경비 검증 실패: ${validation.reason}`, validation }, { status: 422 });
      }
    }

    const expense = await createExpense({
      category: body.category,
      subcategory: body.subcategory ?? null,
      amount,
      description: body.description ?? null,
      receipt_url: body.receipt_url ?? null,
      expense_date: body.expense_date,
      payment_method: body.payment_method ?? "카드",
      reservation_id: body.reservation_id ?? null,
      vendor_id: body.vendor_id ?? null,
    });
    return NextResponse.json({ expense });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createLedgerEntry, listLedgerEntries } from "@/lib/account-ledger";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  try {
    const entries = await listLedgerEntries();
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  let body: { entryDate?: string; direction?: string; amount?: number; category?: string; memo?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const entryDate = body.entryDate?.trim() ?? "";
  const direction = body.direction === "IN" || body.direction === "OUT" ? body.direction : null;
  const amount = Number(body.amount);
  if (!entryDate || !direction || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "entryDate/direction(IN|OUT)/amount(양수)가 필요합니다." }, { status: 400 });
  }
  try {
    const entry = await createLedgerEntry({
      entryDate,
      direction,
      amount,
      category: body.category?.trim() || "기타",
      memo: body.memo
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "저장 실패" }, { status: 500 });
  }
}

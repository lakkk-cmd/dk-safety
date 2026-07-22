import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { computeReconciliation, createBalanceCheckpoint, listBalanceCheckpoints } from "@/lib/account-ledger";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  try {
    const [checkpoints, reconciliation] = await Promise.all([listBalanceCheckpoints(), computeReconciliation()]);
    return NextResponse.json({ checkpoints, reconciliation });
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
  let body: { balance?: number; memo?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const balance = Number(body.balance);
  if (!Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({ message: "balance(0 이상 숫자)가 필요합니다." }, { status: 400 });
  }
  try {
    const checkpoint = await createBalanceCheckpoint({ balance, memo: body.memo });
    const reconciliation = await computeReconciliation();
    return NextResponse.json({ checkpoint, reconciliation }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "저장 실패" }, { status: 500 });
  }
}

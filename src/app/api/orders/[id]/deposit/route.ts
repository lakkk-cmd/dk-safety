import { NextResponse } from "next/server";
import { pgMarkWaitingForDeposit } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function PATCH(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ message: "orderId가 필요합니다." }, { status: 400 });
  }
  try {
    const order = await pgMarkWaitingForDeposit(id);
    return NextResponse.json({ order, message: "입금 대기 상태로 변경되었습니다." });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "상태 변경 실패" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { pgFindOrderById, pgIssueVirtualAccount } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const order = await pgIssueVirtualAccount(id);
    return NextResponse.json({ message: "가상계좌가 발급되었습니다.", order });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "가상계좌 발급 실패" }, { status: 400 });
  }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const order = await pgFindOrderById(id);
    if (!order) {
      return NextResponse.json({ message: "주문 정보를 찾지 못했습니다." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "주문 조회 실패" }, { status: 400 });
  }
}

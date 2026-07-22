import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgMarkManualRefundCompleted } from "@/lib/orders-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  let body: { orderId?: string } = {};
  try {
    body = (await request.json()) as { orderId?: string };
  } catch {
    return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const orderId = body.orderId?.trim() ?? "";
  if (!orderId) {
    return NextResponse.json({ message: "orderId가 필요합니다." }, { status: 400 });
  }

  try {
    await pgMarkManualRefundCompleted(orderId);
    return NextResponse.json({ message: "수동환불 완료로 처리되었습니다." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "수동환불 완료 처리 실패" },
      { status: 500 }
    );
  }
}

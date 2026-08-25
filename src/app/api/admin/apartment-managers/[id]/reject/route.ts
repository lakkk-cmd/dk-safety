import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgRejectApartmentManagerSignup } from "@/lib/apartment-managers-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { reason?: string };

  try {
    await pgRejectApartmentManagerSignup(id, body.reason ?? "");
    return NextResponse.json({ message: "거절 처리되었습니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "거절 처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

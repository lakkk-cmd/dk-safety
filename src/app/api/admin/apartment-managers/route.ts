import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgListApartmentManagers, type ApprovalStatus } from "@/lib/apartment-managers-pg";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

const VALID_STATUS = new Set<ApprovalStatus>(["pending", "approved", "rejected"]);

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const statusParam = new URL(request.url).searchParams.get("status");
  const status = statusParam && VALID_STATUS.has(statusParam as ApprovalStatus) ? (statusParam as ApprovalStatus) : undefined;
  try {
    const managers = await pgListApartmentManagers(status);
    return NextResponse.json({ managers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

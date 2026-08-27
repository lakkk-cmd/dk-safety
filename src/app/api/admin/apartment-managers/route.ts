import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgListApartmentManagers, type ApprovalStatus } from "@/lib/apartment-managers-pg";
import { pgListSubscriptionsByApartmentIds } from "@/lib/apartment-subscriptions-pg";
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
    // 관리자 화면이 매니저 행에 바로 구독 뱃지/계좌이체 확인 버튼을 붙일 수 있도록 함께 내려준다.
    const apartmentIds = Array.from(
      new Set(managers.map((m) => m.apartmentId).filter((id): id is string => Boolean(id)))
    );
    const subscriptions = await pgListSubscriptionsByApartmentIds(apartmentIds);
    return NextResponse.json({ managers, subscriptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

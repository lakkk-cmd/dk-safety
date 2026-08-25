import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgApproveApartmentManagerSignup, pgGetApartmentManager } from "@/lib/apartment-managers-pg";
import { sendSMS } from "@/lib/solapi-agent";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;

  try {
    await pgApproveApartmentManagerSignup(id);
    const manager = await pgGetApartmentManager(id);

    let smsSent = false;
    if (manager) {
      try {
        await sendSMS(
          manager.phone,
          `[대경이엔피] 세대전기점검 앱 가입이 승인됐습니다. 등록하신 아이디로 지금 로그인하실 수 있어요. inspect.dkansim.com`
        );
        smsSent = true;
      } catch (error) {
        console.error("[admin/apartment-managers/approve] 승인 알림 SMS 발송 실패:", error);
      }
    }

    return NextResponse.json({ message: "승인되었습니다.", smsSent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "승인 처리에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

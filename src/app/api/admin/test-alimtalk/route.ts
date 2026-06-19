import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { notifyCustomerWorkCompleted } from "@/lib/customer-notification";

// 알림톡 테스트 발송 — 관리자 전용, 프로덕션 환경에서만 사용
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    phone?: string;
    name?: string;
    serviceType?: string;
    preferredDate?: string;
    preferredTime?: string;
  };

  const reservation = {
    id: "test-" + Date.now(),
    name: body.name ?? "테스트고객",
    phone: body.phone ?? "01012345678",
    apartmentName: "테스트 아파트 101동",
    serviceType: body.serviceType ?? "전기 안전 점검",
    preferredDate: body.preferredDate ?? new Date().toLocaleDateString("ko-KR"),
    preferredTime: body.preferredTime ?? "오후 2시",
  };

  try {
    const channels = await notifyCustomerWorkCompleted(reservation);
    return NextResponse.json({
      success: true,
      channels,
      reservation,
      message: channels.length > 0
        ? `알림 발송 성공: ${channels.join(", ")}`
        : "발송된 채널 없음 — 환경변수를 확인하세요.",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "발송 실패", reservation },
      { status: 500 },
    );
  }
}

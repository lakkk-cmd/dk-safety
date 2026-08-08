import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { sendAdminAlertSms } from "@/lib/solapi-agent";
import { ADMIN_ALERT_PHONE } from "@/lib/site-config";

// 대표님 개인 휴대폰(ADMIN_ALERT_PHONE) SMS 발송 진단 — 관리자 전용.
// sendAdminAlertSms는 예약 접수/A/S 요청 등에서 best-effort로 호출되어 실패해도
// 흐름을 막지 않고 activity-log에만 남기는데, Vercel 서버리스는 파일시스템이
// 읽기전용이라 그 로그조차 조용히 사라진다 — 그래서 실패 원인을 직접 눈으로 봐야 한다.
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }

  const phoneConfigured = ADMIN_ALERT_PHONE.trim().length > 0;
  const maskedPhone = phoneConfigured
    ? ADMIN_ALERT_PHONE.replace(/(\d{3})\d*(\d{4})/, "$1****$2")
    : null;

  try {
    const result = await sendAdminAlertSms(`[진단 테스트] ${new Date().toISOString()} 관리자 SMS 발송 테스트입니다.`);
    return NextResponse.json({ success: true, phoneConfigured, maskedPhone, result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        phoneConfigured,
        maskedPhone,
        message: error instanceof Error ? error.message : "발송 실패"
      },
      { status: 500 }
    );
  }
}

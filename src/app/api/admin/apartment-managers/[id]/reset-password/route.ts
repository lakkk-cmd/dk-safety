import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pgGetApartmentManager, pgResetApartmentManagerPassword } from "@/lib/apartment-managers-pg";
import { generateTempPassword, hashApartmentManagerPassword } from "@/lib/apt-manager-password";
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
    const manager = await pgGetApartmentManager(id);
    if (!manager) {
      return NextResponse.json({ message: "계정을 찾을 수 없습니다." }, { status: 404 });
    }

    const tempPassword = generateTempPassword();
    await pgResetApartmentManagerPassword(id, hashApartmentManagerPassword(tempPassword));

    try {
      await sendSMS(manager.phone, `[대경이엔피] 세대전기점검 앱 임시비밀번호: ${tempPassword}`);
    } catch (error) {
      console.error("[admin/apartment-managers/reset-password] SMS 발송 실패:", error);
      return NextResponse.json(
        { message: "비밀번호는 재발급됐지만 SMS 발송에 실패했습니다. 대표님이 직접 전달해주세요.", tempPassword },
        { status: 200 }
      );
    }

    return NextResponse.json({ message: "새 비밀번호를 SMS로 발송했습니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "비밀번호 재발급에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

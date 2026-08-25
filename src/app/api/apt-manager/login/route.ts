import { NextResponse } from "next/server";
import { pgFindApartmentManagerByLoginId, pgTouchApartmentManagerLastLogin } from "@/lib/apartment-managers-pg";
import { verifyApartmentManagerPassword } from "@/lib/apt-manager-password";
import { signApartmentManagerSessionToken } from "@/lib/apt-manager-auth";
import { APT_MANAGER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";

function toStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const loginId = toStringField(body.loginId).trim();
  const password = toStringField(body.password);
  if (!loginId || !password) {
    return NextResponse.json({ message: "아이디와 비밀번호를 입력해주세요." }, { status: 400 });
  }

  try {
    const manager = await pgFindApartmentManagerByLoginId(loginId);
    if (!manager || !verifyApartmentManagerPassword(password, manager.passwordHash)) {
      return NextResponse.json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    if (manager.approvalStatus === "pending") {
      return NextResponse.json({ status: "pending" as const });
    }
    if (manager.approvalStatus === "rejected") {
      return NextResponse.json({ message: "가입신청이 승인되지 않았습니다. 대경이엔피로 문의해주세요." }, { status: 403 });
    }

    await pgTouchApartmentManagerLastLogin(manager.id);
    const { token, maxAge } = signApartmentManagerSessionToken(manager.id);

    const response = NextResponse.json({ status: "approved" as const });
    response.cookies.set(APT_MANAGER_AUTH_COOKIE, token, {
      path: "/",
      maxAge,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "로그인에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

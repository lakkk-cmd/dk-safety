import { NextResponse } from "next/server";
import { pgFindAdminAccountByPhone, pgTouchAdminLastLogin } from "@/lib/admin-accounts-pg";
import { signAdminSessionToken } from "@/lib/admin-session";
import { normalizePhone } from "@/lib/reservation-validation";
import { ADMIN_AUTH_COOKIE, ADMIN_ID_COOKIE, siteConfig } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerPin } from "@/lib/worker-pin";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string; phone?: string };
  const password = body.password?.trim() ?? "";
  const phoneRaw = body.phone?.trim() ?? "";

  if (!password) {
    return NextResponse.json({ message: "비밀번호를 입력해주세요." }, { status: 400 });
  }

  // 마스터 비밀번호는 계정 유무와 무관하게 항상 허용 — 계정을 잘못 만지다 전원 잠기는 사고 방지용 최후 수단.
  let authenticatedAccountId: string | null = null;
  if (password !== siteConfig.adminPassword) {
    if (!phoneRaw || !isSupabaseReservationsDbReady()) {
      return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    try {
      const account = await pgFindAdminAccountByPhone(normalizePhone(phoneRaw));
      if (!account || !account.active || !verifyWorkerPin(password, account.password_hash)) {
        return NextResponse.json({ message: "연락처 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      authenticatedAccountId = account.id;
      await pgTouchAdminLastLogin(account.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.";
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  const isProd = process.env.NODE_ENV === "production";
  const cookieDomain = isProd ? { domain: ".dkansim.com" } : {};

  const response = NextResponse.json({ message: "로그인되었습니다." });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: "ok",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 8,
    ...cookieDomain
  });
  response.cookies.set({
    name: FIRST_VISIT_COOKIE,
    value: "1",
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    ...cookieDomain
  });
  if (authenticatedAccountId) {
    const signed = signAdminSessionToken(authenticatedAccountId);
    if (signed) {
      response.cookies.set({
        name: ADMIN_ID_COOKIE,
        value: signed.token,
        httpOnly: true,
        sameSite: "lax",
        secure: isProd,
        path: "/",
        maxAge: signed.maxAge,
        ...cookieDomain
      });
    }
  } else {
    response.cookies.set({ name: ADMIN_ID_COOKIE, value: "", path: "/", maxAge: 0, ...cookieDomain });
  }
  return response;
}

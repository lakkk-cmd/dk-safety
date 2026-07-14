import { NextResponse } from "next/server";
import { BOMI_AUTH_COOKIE, BOMI_PASSWORD } from "@/lib/site-config";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = body.password?.trim() ?? "";

  if (!password || password !== BOMI_PASSWORD) {
    return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ message: "로그인되었습니다." });
  // 세션 쿠키(maxAge 없음) — 브라우저를 완전히 종료하면 삭제되어, 다음 접속 시 무조건
  // 로그아웃 상태(로그인 화면)부터 시작한다. 탭/새로고침 중에는 로그인 유지.
  response.cookies.set({
    name: BOMI_AUTH_COOKIE,
    value: "ok",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    ...(isProd ? { domain: ".dkansim.com" } : {})
  });
  return response;
}

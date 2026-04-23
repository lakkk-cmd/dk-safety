import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE, siteConfig } from "@/lib/site-config";

const FIRST_VISIT_COOKIE = "dk_first_visit_checked";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = body.password?.trim() ?? "";

  if (!password) {
    return NextResponse.json({ message: "비밀번호를 입력해주세요." }, { status: 400 });
  }

  if (password !== siteConfig.adminPassword) {
    return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ message: "로그인되었습니다." });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: "ok",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  response.cookies.set({
    name: FIRST_VISIT_COOKIE,
    value: "1",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
  return response;
}

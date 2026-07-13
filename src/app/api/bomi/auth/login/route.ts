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
  response.cookies.set({
    name: BOMI_AUTH_COOKIE,
    value: "ok",
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 12,
    ...(isProd ? { domain: ".dkansim.com" } : {})
  });
  return response;
}

import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE, ADMIN_ID_COOKIE } from "@/lib/site-config";

export async function POST() {
  const cookieDomain = process.env.NODE_ENV === "production" ? { domain: ".dkansim.com" } : {};

  const response = NextResponse.json({ message: "로그아웃되었습니다." });
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    ...cookieDomain
  });
  response.cookies.set({
    name: ADMIN_ID_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    ...cookieDomain
  });
  return response;
}

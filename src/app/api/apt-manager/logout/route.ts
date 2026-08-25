import { NextResponse } from "next/server";
import { APT_MANAGER_AUTH_COOKIE } from "@/lib/site-config";

export async function POST() {
  const response = NextResponse.json({ message: "로그아웃되었습니다." });
  response.cookies.set(APT_MANAGER_AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

import { NextResponse } from "next/server";
import { BOMI_AUTH_COOKIE } from "@/lib/site-config";

export async function POST() {
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ message: "로그아웃되었습니다." });
  response.cookies.set({
    name: BOMI_AUTH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    ...(isProd ? { domain: ".dkansim.com" } : {})
  });
  return response;
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { removeSession } from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  if (sessionId) {
    await removeSession(sessionId);
  }

  const response = NextResponse.json({ message: "로그아웃되었습니다." });
  response.cookies.set({
    name: RESIDENT_AUTH_COOKIE,
    value: "",
    path: "/",
    maxAge: 0
  });
  return response;
}

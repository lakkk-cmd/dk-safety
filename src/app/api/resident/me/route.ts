import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getResidentBySessionId } from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await getResidentBySessionId(sessionId);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}

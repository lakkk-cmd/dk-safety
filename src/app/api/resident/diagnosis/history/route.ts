import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getResidentBySessionId, listDiagnosesByUser } from "@/lib/resident-db";
import { RESIDENT_AUTH_COOKIE } from "@/lib/site-config";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(RESIDENT_AUTH_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const user = await getResidentBySessionId(sessionId);
  if (!user) {
    return NextResponse.json({ message: "세션이 만료되었습니다." }, { status: 401 });
  }

  const diagnoses = await listDiagnosesByUser(user.id, 30);
  return NextResponse.json({ diagnoses });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgListTasksForWorker } from "@/lib/reservations-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function GET() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(WORKER_AUTH_COOKIE)?.value;
  const session = verifyWorkerSessionToken(token);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const items = await pgListTasksForWorker(session.workerId);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "작업 목록을 불러오지 못했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

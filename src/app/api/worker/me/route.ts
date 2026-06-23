import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgGetWorkerById } from "@/lib/reservations-pg";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function GET() {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const worker = await pgGetWorkerById(session.workerId);
    if (!worker) {
      return NextResponse.json({ message: "기사를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ name: worker.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgGetFieldReportForWorker } from "@/lib/field-reports";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const { id } = await context.params;
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const report = await pgGetFieldReportForWorker(id, session.workerId);
    if (!report) {
      return NextResponse.json({ message: "기록을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateFieldReportOpinion } from "@/lib/field-report-opinion";
import { pgGetFieldReportForWorker, pgSaveFieldReportOpinion } from "@/lib/field-reports";
import { WORKER_AUTH_COOKIE } from "@/lib/site-config";
import { isSupabaseReservationsDbReady } from "@/lib/supabase-pg";
import { verifyWorkerSessionToken } from "@/lib/worker-auth";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isSupabaseReservationsDbReady()) {
    return NextResponse.json({ message: "Supabase DB 모드가 아닙니다." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const session = verifyWorkerSessionToken(cookieStore.get(WORKER_AUTH_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { fieldReportId?: string } | null;
  const fieldReportId = body?.fieldReportId?.trim();
  if (!fieldReportId) {
    return NextResponse.json({ message: "fieldReportId가 필요합니다." }, { status: 400 });
  }

  try {
    const report = await pgGetFieldReportForWorker(fieldReportId, session.workerId);
    if (!report) {
      return NextResponse.json({ message: "현장 점검 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const opinion = await generateFieldReportOpinion(report);
    const updated = await pgSaveFieldReportOpinion(fieldReportId, opinion);

    return NextResponse.json({
      opinionLandlord: updated.opinionLandlord,
      opinionResident: updated.opinionResident,
      status: updated.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "소견 생성에 실패했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

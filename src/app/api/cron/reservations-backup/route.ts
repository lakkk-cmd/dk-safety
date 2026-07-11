import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { createAutoBackup } from "@/lib/reservations-store";
import { notifyPipelineFailure } from "@/lib/kakao-publish";

export const maxDuration = 30;

const PIPELINE = "reservations-backup";

/**
 * 예약 write 시점 자동백업(snapshotOnWrite)이 PG 모드에서는 애초에 안 불려서
 * (writeReservations는 shouldUsePgReservations()일 때 호출되지 않음 — 운영 공백 점검 9번),
 * 시간 기반으로 매일 별도 백업을 만든다.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isAgentSupabaseReady()) {
    return NextResponse.json(
      { success: false, error: "Supabase URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정" },
      { status: 500 },
    );
  }

  try {
    const snapshot = await createAutoBackup();
    return NextResponse.json({ success: true, pipeline: PIPELINE, snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyPipelineFailure(PIPELINE, message).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runContentApprovalNotify } from "@/lib/content-pipeline";
import { notifyPipelineFailure } from "@/lib/kakao-publish";

export const maxDuration = 30;

const PIPELINE = "content-approval-notify";

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
    const result = await runContentApprovalNotify();
    return NextResponse.json({ success: true, pipeline: PIPELINE, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyPipelineFailure(PIPELINE, message).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

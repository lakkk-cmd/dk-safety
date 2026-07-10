import { NextResponse } from "next/server";
import { isAgentSupabaseReady } from "@/lib/agent-db";
import { runContentPerformanceReview } from "@/lib/content-performance";
import { notifyPipelineFailure } from "@/lib/kakao-publish";

export const maxDuration = 300;

const PIPELINE = "content-performance-review";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json(
      { success: false, error: "Supabase URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정" },
      { status: 500 },
    );
  }

  try {
    const result = await runContentPerformanceReview();
    return NextResponse.json({ success: true, pipeline: PIPELINE, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await notifyPipelineFailure(PIPELINE, message).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { analyzeVideoTranscript } from "@/lib/gemini-pipeline";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";

export const maxDuration = 120;

const PIPELINE = "youtube-analyze";
const MAX_PER_RUN = 5;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "GEMINI_API_KEY 미설정" }, { status: 500 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json(
      { success: false, error: "Supabase URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정" },
      { status: 500 },
    );
  }

  const supabase = requireAgentSupabase();
  const runId = await startPipelineRun(PIPELINE);

  try {
    const { data: analyzed, error: analyzedError } = await supabase.from("youtube_insights").select("video_id");
    if (analyzedError) throw analyzedError;
    const analyzedIds = new Set((analyzed ?? []).map((row) => row.video_id as string));

    const { data: videos, error: videosError } = await supabase
      .from("youtube_videos")
      .select("id, title, transcript")
      .not("transcript", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(20);
    if (videosError) throw videosError;

    const targets = (videos ?? []).filter((video) => !analyzedIds.has(video.id as string)).slice(0, MAX_PER_RUN);

    let analyzedCount = 0;
    const errors: { video: string; error: string }[] = [];

    for (const video of targets) {
      const label = (video.title as string | null) ?? (video.id as string);
      try {
        const result = await analyzeVideoTranscript((video.title as string | null) ?? "", (video.transcript as string | null) ?? "");
        const { error: insertError } = await supabase.from("youtube_insights").insert({
          video_id: video.id,
          summary: result.summary,
          insights: result.insights,
          model: result.model,
        });
        if (insertError) throw insertError;
        analyzedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ video: label, error: message });
        await logAgentEvent("error", PIPELINE, `${label} 분석 실패: ${message}`);
      }
    }

    await logAgentEvent("info", PIPELINE, `${targets.length}건 분석 시도, ${analyzedCount}건 완료`);
    await finishPipelineRun(runId, errors.length > 0 ? "failed" : "success", {
      candidates: targets.length,
      analyzed: analyzedCount,
      errors,
    });

    return NextResponse.json({ success: true, candidates: targets.length, analyzed: analyzedCount, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAgentEvent("error", PIPELINE, `파이프라인 실패: ${message}`);
    await finishPipelineRun(runId, "failed", { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

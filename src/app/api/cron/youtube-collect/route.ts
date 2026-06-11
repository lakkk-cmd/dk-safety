import { NextResponse } from "next/server";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { fetchLatestVideos } from "@/lib/youtube-pipeline";
import { finishPipelineRun, logAgentEvent, startPipelineRun } from "@/lib/pipeline-logs";

export const maxDuration = 60;

const PIPELINE = "youtube-collect";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    return NextResponse.json({ success: false, error: "YOUTUBE_API_KEY 미설정" }, { status: 500 });
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
    const { data: channels, error: channelsError } = await supabase
      .from("youtube_channels")
      .select("id, channel_id, channel_name")
      .eq("active", true);
    if (channelsError) throw channelsError;

    let inserted = 0;
    let skipped = 0;
    const errors: { channel: string; error: string }[] = [];

    for (const channel of channels ?? []) {
      try {
        const videos = await fetchLatestVideos(channel.channel_id, 5);
        for (const video of videos) {
          const { error: insertError } = await supabase.from("youtube_videos").insert({
            channel_id: channel.id,
            video_id: video.videoId,
            title: video.title,
            published_at: video.publishedAt,
          });
          if (insertError) {
            if (insertError.code === "23505") {
              skipped++;
              continue;
            }
            throw insertError;
          }
          inserted++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ channel: channel.channel_name, error: message });
        await logAgentEvent("error", PIPELINE, `${channel.channel_name} 수집 실패: ${message}`);
      }
    }

    await logAgentEvent(
      "info",
      PIPELINE,
      `${channels?.length ?? 0}개 채널 수집 완료 (신규 ${inserted}, 중복 ${skipped})`,
    );
    await finishPipelineRun(runId, errors.length > 0 ? "failed" : "success", {
      channels: channels?.length ?? 0,
      inserted,
      skipped,
      errors,
    });

    return NextResponse.json({ success: true, channels: channels?.length ?? 0, inserted, skipped, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAgentEvent("error", PIPELINE, `파이프라인 실패: ${message}`);
    await finishPipelineRun(runId, "failed", { error: message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

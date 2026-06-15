import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";
import { analyzeYoutubeChannel } from "@/lib/youtube-channel-analysis";

// 영상 12개 메타데이터 + 자막 3개 fetch + Claude 분석 1회로 시간이 걸릴 수 있음
export const maxDuration = 300;

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from("youtube_channel_analyses")
      .select("id, channel_id, channel_name, channel_url, pattern_summary, proposals, queue_ids, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ analyses: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

/** 채널 URL/핸들/이름으로 채널 패턴 분석 + 콘텐츠 제안 10건 생성 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ message: "권한이 없습니다." }, { status: 401 });
  }
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ message: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    return NextResponse.json({ message: "YOUTUBE_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ message: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { channelUrl?: string };
    const channelUrl = body.channelUrl?.trim();
    if (!channelUrl) {
      return NextResponse.json({ message: "channelUrl 파라미터가 필요합니다." }, { status: 400 });
    }

    const result = await analyzeYoutubeChannel(channelUrl);
    return NextResponse.json({
      message: `"${result.channelName}" 채널 분석 완료. 콘텐츠 제안 ${result.proposals.length}건이 유튜브 큐에 추가되었습니다.`,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "분석 실패" },
      { status: 500 },
    );
  }
}

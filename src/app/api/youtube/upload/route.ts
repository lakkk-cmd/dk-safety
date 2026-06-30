import { NextResponse } from "next/server";
import { uploadVideo, updateQueueStatus } from "@/lib/youtube-agent";
import { logAgentEvent } from "@/lib/pipeline-logs";
import { isAgentSupabaseReady } from "@/lib/agent-db";

export const maxDuration = 300;

const ALLOWED_DOMAINS = ["storage.googleapis.com", "supabase.co", "dkansim.com"];

type UploadBody = {
  videoUrl?: string;
  queueId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  boss_confirmed?: boolean;
};

function checkUploadAuth(request: Request, body: UploadBody): string | null {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return "AGENT_WRITE_SECRET가 설정되지 않았습니다.";
  if (request.headers.get("Authorization") !== `Bearer ${secret}`) return "인증 실패";
  if (!body.boss_confirmed) return "boss_confirmed: true 필드가 필요합니다.";
  return null;
}

function isAllowedDomain(videoUrl: string): boolean {
  try {
    const host = new URL(videoUrl).hostname;
    return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAgentSupabaseReady()) {
    return NextResponse.json({ error: "Supabase가 설정되지 않았습니다." }, { status: 503 });
  }

  let body: UploadBody;
  try {
    body = (await request.json()) as UploadBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const authError = checkUploadAuth(request, body);
  if (authError) {
    const status = authError.includes("설정되지") ? 500 : authError.includes("인증") ? 401 : 403;
    return NextResponse.json({ error: authError }, { status });
  }

  const { videoUrl, queueId, title, description, tags } = body;
  if (!videoUrl || !title) {
    return NextResponse.json({ error: "videoUrl, title 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!isAllowedDomain(videoUrl)) {
    return NextResponse.json(
      { error: `허용되지 않은 도메인입니다. 허용 도메인: ${ALLOWED_DOMAINS.join(", ")}` },
      { status: 403 },
    );
  }

  try {
    const videoId = await uploadVideo(videoUrl, { title, description: description ?? "", tags });

    if (queueId) {
      await updateQueueStatus(queueId, videoId);
    }

    await logAgentEvent("info", "youtube-upload-api", `업로드 완료: ${videoId}`, {
      videoId, queueId, title,
    });
    return NextResponse.json({ success: true, videoId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드 실패";
    await logAgentEvent("error", "youtube-upload-api", message, { videoUrl, title });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { getYoutubeAccessToken } from "@/lib/youtube-upload";
import { requireAgentSupabase } from "@/lib/agent-db";
import { logAgentEvent } from "@/lib/pipeline-logs";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

export type VideoMetadata = {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private" | "unlisted" | "public";
};

/** videoUrl에서 영상을 다운로드한 뒤 유튜브에 업로드하고 video ID를 반환 */
export async function uploadVideo(videoUrl: string, metadata: VideoMetadata): Promise<string> {
  const accessToken = await getYoutubeAccessToken();

  const dlRes = await fetch(videoUrl);
  if (!dlRes.ok) throw new Error(`영상 다운로드 실패: ${dlRes.status} ${videoUrl}`);
  const videoBuffer = Buffer.from(await dlRes.arrayBuffer());
  const mimeType = dlRes.headers.get("content-type") ?? "video/mp4";

  const meta = {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags ?? [],
      categoryId: metadata.categoryId ?? "26",
    },
    status: { privacyStatus: metadata.privacyStatus ?? "private" },
  };

  const boundary = `dkansim-agent-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`, "utf-8"),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, "utf-8"),
    videoBuffer,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);

  const uploadRes = await fetch(`${YOUTUBE_UPLOAD_URL}?uploadType=multipart&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!uploadRes.ok) throw new Error(`유튜브 업로드 실패: ${uploadRes.status} ${await uploadRes.text()}`);
  const json = (await uploadRes.json()) as { id?: string };
  if (!json.id) throw new Error("유튜브 업로드 응답에 video id가 없습니다.");

  await logAgentEvent("info", "youtube-agent", `영상 업로드 완료: ${json.id}`, {
    videoId: json.id, title: metadata.title,
  });
  return json.id;
}

/** 유튜브 영상 예약 발행 설정 (publishAt: ISO 8601) */
export async function scheduleVideo(videoId: string, publishAt: string): Promise<void> {
  const accessToken = await getYoutubeAccessToken();

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?part=status`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: videoId,
      status: { privacyStatus: "private", publishAt },
    }),
  });

  if (!res.ok) throw new Error(`예약 발행 설정 실패: ${res.status} ${await res.text()}`);
}

export type VideoAnalytics = {
  videoId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
};

/** 유튜브 Data API v3 statistics part로 영상 통계 조회 */
export async function getAnalytics(videoId: string): Promise<VideoAnalytics> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const accessToken = await getYoutubeAccessToken().catch(() => null);

  const params = new URLSearchParams({ part: "statistics", id: videoId });
  if (apiKey) params.set("key", apiKey);

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(`영상 통계 조회 실패: ${res.status} ${await res.text()}`);

  const json = (await res.json()) as {
    items?: Array<{
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
        favoriteCount?: string;
      };
    }>;
  };
  const stats = json.items?.[0]?.statistics ?? {};
  return {
    videoId,
    viewCount: Number(stats.viewCount ?? 0),
    likeCount: Number(stats.likeCount ?? 0),
    commentCount: Number(stats.commentCount ?? 0),
    favoriteCount: Number(stats.favoriteCount ?? 0),
  };
}

/** 업로드 완료 후 content_youtube_queue 상태를 uploaded로 갱신하고 video URL 저장 */
export async function updateQueueStatus(queueId: string, videoId: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const videoAssetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const { error } = await supabase
    .from("content_youtube_queue")
    .update({
      status: "uploaded",
      video_asset_url: videoAssetUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId);
  if (error) throw error;
}

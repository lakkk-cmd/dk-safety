// YouTube Data API v3 — 채널별 최신 영상 수집
// https://developers.google.com/youtube/v3/docs/search/list

export type YoutubeSearchItem = {
  videoId: string;
  title: string | null;
  publishedAt: string | null;
};

export async function fetchLatestVideos(channelId: string, maxResults = 5): Promise<YoutubeSearchItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY가 설정되지 않았습니다.");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("type", "video");

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      const err = JSON.parse(raw) as { error?: { message?: string } };
      detail = err.error?.message ?? detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`YouTube API ${res.status}: ${detail}`);
  }

  const data = JSON.parse(raw) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; publishedAt?: string } }[];
  };

  return (data.items ?? [])
    .map((item) => ({
      videoId: item.id?.videoId ?? "",
      title: item.snippet?.title ?? null,
      publishedAt: item.snippet?.publishedAt ?? null,
    }))
    .filter((item) => item.videoId.length > 0);
}

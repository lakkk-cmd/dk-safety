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

export type ResolvedYoutubeChannel = {
  channelId: string;
  channelName: string | null;
  channelUrl: string;
};

/** 채널 URL/핸들/이름 등 다양한 입력으로부터 채널 ID를 찾아냄 */
export async function resolveYoutubeChannel(input: string): Promise<ResolvedYoutubeChannel | null> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY가 설정되지 않았습니다.");
  }

  const trimmed = input.trim();

  const fetchJson = async (url: URL) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
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
    return JSON.parse(raw) as {
      items?: { id?: string | { channelId?: string }; snippet?: { title?: string; channelId?: string } }[];
    };
  };

  const channelIdMatch = trimmed.match(/UC[0-9A-Za-z_-]{22}/);
  if (channelIdMatch) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("id", channelIdMatch[0]);
    url.searchParams.set("part", "snippet");
    const data = await fetchJson(url);
    const item = data.items?.[0];
    if (item) {
      return {
        channelId: channelIdMatch[0],
        channelName: item.snippet?.title ?? null,
        channelUrl: `https://www.youtube.com/channel/${channelIdMatch[0]}`,
      };
    }
  }

  const handleMatch = trimmed.match(/@[\w.-]+/);
  if (handleMatch) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("forHandle", handleMatch[0]);
    url.searchParams.set("part", "snippet");
    const data = await fetchJson(url);
    const item = data.items?.[0];
    const id = typeof item?.id === "string" ? item.id : item?.id?.channelId;
    if (item && id) {
      return {
        channelId: id,
        channelName: item.snippet?.title ?? null,
        channelUrl: `https://www.youtube.com/${handleMatch[0]}`,
      };
    }
  }

  // 그 외(일반 텍스트, /c/, /user/ 등): 채널 검색으로 첫 결과 사용
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("type", "channel");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "1");
  const data = await fetchJson(url);
  const item = data.items?.[0];
  const id = typeof item?.id === "string" ? item.id : item?.id?.channelId;
  if (!item || !id) return null;
  return {
    channelId: id,
    channelName: item.snippet?.title ?? null,
    channelUrl: `https://www.youtube.com/channel/${id}`,
  };
}

export type YoutubeChannelVideo = {
  videoId: string;
  title: string | null;
  viewCount: number;
  thumbnail: string | null;
  publishedAt: string | null;
};

/** 채널의 조회수 상위 영상을 통계 정보와 함께 조회 */
export async function fetchChannelTopVideos(channelId: string, max = 12): Promise<YoutubeChannelVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY가 설정되지 않았습니다.");
  }

  const fetchJson = async (url: URL) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
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
    return JSON.parse(raw);
  };

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("channelId", channelId);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("order", "viewCount");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", String(max));
  const searchData = (await fetchJson(searchUrl)) as {
    items?: { id?: { videoId?: string } }[];
  };
  const videoIds = (searchData.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (videoIds.length === 0) return [];

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("key", apiKey);
  videosUrl.searchParams.set("id", videoIds.join(","));
  videosUrl.searchParams.set("part", "snippet,statistics");
  const videosData = (await fetchJson(videosUrl)) as {
    items?: {
      id?: string;
      snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
      statistics?: { viewCount?: string };
    }[];
  };

  return (videosData.items ?? [])
    .map((item) => ({
      videoId: item.id ?? "",
      title: item.snippet?.title ?? null,
      viewCount: Number(item.statistics?.viewCount ?? 0),
      thumbnail: item.snippet?.thumbnails?.medium?.url ?? null,
      publishedAt: item.snippet?.publishedAt ?? null,
    }))
    .filter((item) => item.videoId.length > 0)
    .sort((a, b) => b.viewCount - a.viewCount);
}

export type YoutubePopularItem = {
  videoId: string;
  title: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
};

/** 키워드 검색 결과를 조회수 기준으로 정렬해 인기 영상을 수집 (최근 90일) */
export async function searchPopularVideos(query: string, maxResults = 5): Promise<YoutubePopularItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY가 설정되지 않았습니다.");
  }

  const publishedAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("order", "viewCount");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("type", "video");
  url.searchParams.set("publishedAfter", publishedAfter);
  url.searchParams.set("relevanceLanguage", "ko");

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
    items?: {
      id?: { videoId?: string };
      snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
    }[];
  };

  return (data.items ?? [])
    .map((item) => ({
      videoId: item.id?.videoId ?? "",
      title: item.snippet?.title ?? null,
      channelTitle: item.snippet?.channelTitle ?? null,
      publishedAt: item.snippet?.publishedAt ?? null,
    }))
    .filter((item) => item.videoId.length > 0);
}

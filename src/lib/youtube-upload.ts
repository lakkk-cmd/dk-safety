import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export const YOUTUBE_OAUTH_ENABLED = Boolean(
  process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET,
);

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

function requireOAuthEnv(): { clientId: string; clientSecret: string } {
  if (!YOUTUBE_OAUTH_ENABLED) {
    throw new Error("YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET이 설정되지 않았습니다.");
  }
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID as string,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET as string,
  };
}

function getRedirectUri(): string {
  if (process.env.YOUTUBE_REDIRECT_URI) return process.env.YOUTUBE_REDIRECT_URI;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/youtube/callback`;
}

/** 대장이 유튜브 채널 연동을 시작할 구글 OAuth 동의 화면 URL */
export function getYoutubeAuthUrl(state?: string): string {
  const { clientId } = requireOAuthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

async function saveTokens(token: GoogleTokenResponse): Promise<void> {
  const supabase = requireAgentSupabase();
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const update: Record<string, unknown> = {
    id: 1,
    access_token: token.access_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  if (token.refresh_token) update.refresh_token = token.refresh_token;

  const { error } = await supabase.from("youtube_oauth_tokens").upsert(update, { onConflict: "id" });
  if (error) throw error;
}

/** OAuth 콜백에서 받은 인증 코드를 토큰으로 교환해 저장 */
export async function exchangeYoutubeCode(code: string): Promise<void> {
  const { clientId, clientSecret } = requireOAuthEnv();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`유튜브 OAuth 토큰 교환 실패: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as GoogleTokenResponse;
  await saveTokens(json);

  try {
    const channel = await getYoutubeChannelInfo();
    if (channel) await saveYoutubeChannelId(channel.id);
  } catch {
    // 채널 정보 저장은 부가 기능이므로 실패해도 토큰 저장은 유지
  }
}

type StoredTokens = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

async function loadTokens(): Promise<StoredTokens | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("youtube_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (data as StoredTokens | null) ?? null;
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = requireOAuthEnv();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`유튜브 OAuth 토큰 갱신 실패: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

/** 유효한 access token 반환 (만료 시 자동 갱신 후 저장) */
export async function getYoutubeAccessToken(): Promise<string> {
  requireOAuthEnv();
  const tokens = await loadTokens();
  if (!tokens?.refresh_token) {
    throw new Error("유튜브 채널이 연동되지 않았습니다. /contents에서 유튜브 계정을 연동해주세요.");
  }

  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (tokens.access_token && expiresAt - Date.now() > 60_000) {
    return tokens.access_token;
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  await saveTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token });
  return refreshed.access_token;
}

/** 유튜브 채널 연동 여부 (콘텐츠 사령부 UI 표시용) */
export async function isYoutubeConnected(): Promise<boolean> {
  if (!YOUTUBE_OAUTH_ENABLED || !isAgentSupabaseReady()) return false;
  const tokens = await loadTokens();
  return Boolean(tokens?.refresh_token);
}

export type YoutubeUploadInput = {
  title: string;
  description: string;
  videoBuffer: Buffer;
  mimeType?: string;
  tags?: string[];
};

/** 영상 파일을 실제로 유튜브에 업로드 (multipart, 기본 비공개) */
export async function uploadYoutubeVideo(input: YoutubeUploadInput): Promise<string> {
  const accessToken = await getYoutubeAccessToken();

  const metadata = {
    snippet: {
      title: input.title,
      description: input.description,
      tags: input.tags ?? [],
      categoryId: "26", // Howto & Style
    },
    status: {
      privacyStatus: "private",
    },
  };

  const boundary = `dkansim-${Date.now()}`;
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const videoPartHeader = `--${boundary}\r\nContent-Type: ${input.mimeType ?? "video/mp4"}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(videoPartHeader, "utf-8"),
    input.videoBuffer,
    Buffer.from(closing, "utf-8"),
  ]);

  const res = await fetch(`${YOUTUBE_UPLOAD_URL}?uploadType=multipart&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`유튜브 업로드 실패: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("유튜브 업로드 응답에 video id가 없습니다.");
  return json.id;
}

/** 연동된 계정의 채널 정보 조회 */
export async function getYoutubeChannelInfo(): Promise<{ id: string; title: string } | null> {
  const accessToken = await getYoutubeAccessToken();
  const res = await fetch(`${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`유튜브 채널 정보 조회 실패: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }> };
  const channel = json.items?.[0];
  if (!channel) return null;
  return { id: channel.id, title: channel.snippet?.title ?? "" };
}

export async function saveYoutubeChannelId(channelId: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("youtube_oauth_tokens").update({ channel_id: channelId }).eq("id", 1);
  if (error) throw error;
}

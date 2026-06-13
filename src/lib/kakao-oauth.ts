import { isAgentSupabaseReady, requireAgentSupabase } from "@/lib/agent-db";

export const KAKAO_OAUTH_ENABLED = Boolean(process.env.KAKAO_REST_API_KEY?.trim());

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";

/** "나에게 보내기" 메모 전송에 필요한 동의항목 */
const SCOPE = "talk_message";

function requireOAuthEnv(): { clientId: string; clientSecret?: string } {
  const clientId = process.env.KAKAO_REST_API_KEY?.trim();
  if (!clientId) {
    throw new Error("KAKAO_REST_API_KEY가 설정되지 않았습니다.");
  }
  return { clientId, clientSecret: process.env.KAKAO_CLIENT_SECRET?.trim() || undefined };
}

function getRedirectUri(): string {
  return process.env.KAKAO_REDIRECT_URI?.trim() || "https://dkansim.com/api/kakao/callback";
}

/** 대장이 카카오 계정 연동을 시작할 카카오 로그인 동의 화면 URL */
export function getKakaoAuthUrl(state?: string): string {
  const { clientId } = requireOAuthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPE,
  });
  if (state) params.set("state", state);
  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
}

type KakaoTokenResponse = {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

type KakaoTokenErrorResponse = {
  error?: string;
  error_description?: string;
};

async function saveTokens(token: KakaoTokenResponse): Promise<void> {
  const supabase = requireAgentSupabase();
  const now = Date.now();
  const update: Record<string, unknown> = {
    id: 1,
    access_token: token.access_token,
    expires_at: new Date(now + token.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (token.refresh_token) update.refresh_token = token.refresh_token;
  if (token.refresh_token_expires_in) {
    update.refresh_token_expires_at = new Date(now + token.refresh_token_expires_in * 1000).toISOString();
  }

  const { error } = await supabase.from("kakao_oauth_tokens").upsert(update, { onConflict: "id" });
  if (error) throw error;
}

/** OAuth 콜백에서 받은 인증 코드를 토큰으로 교환해 Supabase에 저장 */
export async function exchangeKakaoCode(code: string): Promise<void> {
  const { clientId, clientSecret } = requireOAuthEnv();
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    code,
  };
  if (clientSecret) body.client_secret = clientSecret;

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as KakaoTokenResponse & KakaoTokenErrorResponse;
  if (!res.ok || json.error) {
    throw new Error(
      `카카오 OAuth 토큰 교환 실패: ${res.status} ${json.error_description ?? json.error ?? JSON.stringify(json)}`,
    );
  }
  await saveTokens(json);
}

type StoredTokens = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
};

async function loadTokens(): Promise<StoredTokens | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("kakao_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return (data as StoredTokens | null) ?? null;
}

async function refreshAccessToken(refreshToken: string): Promise<KakaoTokenResponse> {
  const { clientId, clientSecret } = requireOAuthEnv();
  const body: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  };
  if (clientSecret) body.client_secret = clientSecret;

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as KakaoTokenResponse & KakaoTokenErrorResponse;
  if (!res.ok || json.error) {
    throw new Error(
      `카카오 OAuth 토큰 갱신 실패: ${res.status} ${json.error_description ?? json.error ?? JSON.stringify(json)}`,
    );
  }
  return json;
}

/** 유효한 access token 반환 (Supabase 연동 시 만료 전 자동 갱신, 미연동 시 KAKAO_ACCESS_TOKEN 환경변수로 폴백) */
export async function getKakaoAccessToken(): Promise<string> {
  if (isAgentSupabaseReady()) {
    const tokens = await loadTokens();
    if (tokens?.refresh_token) {
      const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
      if (tokens.access_token && expiresAt - Date.now() > 60_000) {
        return tokens.access_token;
      }
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      await saveTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token });
      return refreshed.access_token;
    }
  }

  const envToken = process.env.KAKAO_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;

  throw new Error("카카오 토큰이 설정되지 않았습니다. /contents에서 카카오 계정을 연동해주세요.");
}

/** 카카오 계정 연동 여부 (콘텐츠 사령부 UI 표시용) */
export async function isKakaoConnected(): Promise<boolean> {
  if (isAgentSupabaseReady()) {
    const tokens = await loadTokens();
    if (tokens?.refresh_token) return true;
  }
  return Boolean(process.env.KAKAO_ACCESS_TOKEN?.trim());
}

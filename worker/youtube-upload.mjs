/**
 * 6단계: 승인된(video_jobs.status='approved') 영상의 실제 유튜브 업로드.
 * src/lib/youtube-upload.ts의 토큰 갱신/multipart 업로드 로직을 워커용으로 포팅 —
 * 토큰 저장소는 동일한 youtube_oauth_tokens(id=1) 행을 postgres 드라이버로 읽고 쓴다.
 * 리포 컨벤션대로 비공개(private) 업로드 — 공개 전환은 대장이 유튜브 스튜디오에서.
 * env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

function requireOAuthEnv() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET이 설정되지 않았습니다.");
  }
  return { clientId, clientSecret };
}

async function getAccessToken(sql) {
  requireOAuthEnv();
  const rows = await sql`
    select access_token, refresh_token, expires_at from youtube_oauth_tokens where id = 1`;
  const tokens = rows[0];
  if (!tokens?.refresh_token) {
    throw new Error("유튜브 채널이 연동되지 않았습니다. contents.dkansim.com에서 연동해주세요.");
  }

  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  if (tokens.access_token && expiresAt - Date.now() > 60_000) {
    return tokens.access_token;
  }

  const { clientId, clientSecret } = requireOAuthEnv();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`유튜브 OAuth 토큰 갱신 실패: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const refreshed = await res.json();
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await sql`
    update youtube_oauth_tokens set
      access_token = ${refreshed.access_token},
      expires_at = ${newExpiresAt},
      refresh_token = ${refreshed.refresh_token ?? tokens.refresh_token},
      updated_at = now()
    where id = 1`;
  return refreshed.access_token;
}

/** 영상 파일 확보 — 로컬 렌더 결과가 있으면 그걸, 없으면 Storage URL에서 내려받는다 */
async function loadVideoBuffer(job, localPath) {
  if (localPath && existsSync(localPath)) {
    return readFile(localPath);
  }
  if (!job.video_path) throw new Error("video_path가 없습니다 — 렌더링 결과를 찾을 수 없습니다.");
  const res = await fetch(job.video_path);
  if (!res.ok) throw new Error(`영상 다운로드 실패 ${res.status}: ${job.video_path}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 승인된 잡 1건을 실제 유튜브에 업로드하고 video id를 반환.
 * 호출부는 반드시 status='approved'→'uploading' 원자 선점 후에만 이 함수를 불러야 한다.
 */
export async function uploadApprovedVideo(sql, job, localPath) {
  const accessToken = await getAccessToken(sql);
  const videoBuffer = await loadVideoBuffer(job, localPath);

  const script = job.script ?? {};
  const metadata = {
    snippet: {
      title: (script.title ?? job.topic).slice(0, 95),
      description: script.description ?? `${job.topic}\n\n예약: https://dkansim.com`,
      tags: Array.isArray(script.tags) ? script.tags.slice(0, 15) : [],
      categoryId: "26", // Howto & Style — 기존 업로드 컨벤션
    },
    status: { privacyStatus: "private" },
  };

  const boundary = `dkansim-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      "utf-8"
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`, "utf-8"),
    videoBuffer,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
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
    throw new Error(`유튜브 업로드 실패: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  if (!json.id) throw new Error("유튜브 업로드 응답에 video id가 없습니다.");
  return json.id;
}

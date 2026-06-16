/**
 * assets_ready 상태의 유튜브 큐 항목 1건을 가져와
 * 씬 이미지(Ken Burns 줌) + edge-tts 나레이션 + 자막 번인으로 9:16 영상을 합성하고,
 * Supabase Storage에 업로드(video_asset_url) 후 (연동되어 있으면) 유튜브에 비공개로 업로드한다.
 *
 * 요구: ffmpeg/ffprobe (apt-get install ffmpeg), edge-tts (pip install edge-tts),
 *       fonts-noto-cjk (자막 한글 폰트)
 * Usage: node --env-file=.env.local scripts/assemble-video.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const VIDEO_BUCKET = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1920;
const CAPTION_FONT = "Noto Sans CJK KR";
const TTS_VOICE = "ko-KR-SunHiNeural";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/**
 * tesseract-ocr(시스템 패키지) 로 이미지에서 한국어 텍스트 감지.
 * tesseract 미설치 환경에서는 조용히 false 반환.
 */
function detectKoreanTextTesseract(imagePath) {
  try {
    const out = execFileSync(
      "tesseract",
      [imagePath, "stdout", "-l", "kor", "--psm", "11", "--oem", "1"],
      { encoding: "utf-8", timeout: 15_000, stdio: ["pipe", "pipe", "pipe"] },
    );
    const text = out.trim();
    if (!text) return false;
    // 한글 유니코드 범위(AC00-D7A3) 문자가 2자 이상이면 텍스트로 판정
    const koreanChars = text.match(/[가-힣]/g) ?? [];
    return koreanChars.length >= 2;
  } catch {
    return false;
  }
}

function wrapCaption(text, maxChars = 20) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function ffprobeDuration(filePath) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
    { encoding: "utf-8" },
  );
  const seconds = parseFloat(out.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`오디오 길이 측정 실패: ${filePath}`);
  }
  return seconds;
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return buf;
}

async function uploadToStorage(objectPath, buffer, contentType) {
  const encodedPath = objectPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${VIDEO_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Storage 업로드 실패 (${res.status}): ${await res.text()}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${encodedPath}`;
}

function buildSegment(dir, index, scene) {
  const imagePath = join(dir, `scene_${index}.png`);
  const audioPath = join(dir, `scene_${index}.mp3`);
  const captionPath = join(dir, `caption_${index}.txt`);
  const segmentPath = join(dir, `segment_${index}.mp4`);

  return { imagePath, audioPath, captionPath, segmentPath };
}

async function downloadScene(scene, paths) {
  if (!scene.imageUrl) throw new Error("씬 이미지 URL이 없습니다.");
  await downloadToFile(scene.imageUrl, paths.imagePath);

  execFileSync("edge-tts", ["--voice", TTS_VOICE, "--text", scene.narration, "--write-media", paths.audioPath], {
    stdio: "pipe",
    timeout: 60_000,
  });

  writeFileSync(paths.captionPath, wrapCaption(scene.narration), "utf-8");
}

function renderSegment(paths) {
  const duration = ffprobeDuration(paths.audioPath);
  const frames = Math.ceil(duration * FPS) + FPS;

  const filter = [
    `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    `zoompan=z='min(zoom+0.0015,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `drawtext=textfile='${paths.captionPath}':reload=0:font='${CAPTION_FONT}':fontcolor=white:fontsize=46:line_spacing=12:box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h-text_h-110`,
  ].join(",");

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loop",
      "1",
      "-i",
      paths.imagePath,
      "-i",
      paths.audioPath,
      "-filter_complex",
      `${filter}[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-t",
      duration.toFixed(3),
      "-shortest",
      paths.segmentPath,
    ],
    { stdio: "pipe" },
  );

  return duration;
}

function concatSegments(dir, segmentPaths, outputPath) {
  const listPath = join(dir, "concat.txt");
  writeFileSync(listPath, segmentPaths.map((p) => `file '${p}'`).join("\n"), "utf-8");

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

async function refreshYoutubeAccessToken(refreshToken) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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
    console.warn(`유튜브 OAuth 토큰 갱신 실패: ${res.status} ${await res.text()}`);
    return null;
  }
  return (await res.json()).access_token ?? null;
}

async function uploadToYoutube(accessToken, title, description, videoBuffer) {
  const metadata = {
    snippet: { title, description, tags: [], categoryId: "26" },
    status: { privacyStatus: "private" },
  };
  const boundary = `dkansim-${Date.now()}`;
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const videoPartHeader = `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([
    Buffer.from(metadataPart, "utf-8"),
    Buffer.from(videoPartHeader, "utf-8"),
    videoBuffer,
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
  const json = await res.json();
  if (!json.id) throw new Error("유튜브 업로드 응답에 video id가 없습니다.");
  return json.id;
}

async function tryUploadToYoutube(queue, videoBuffer) {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    console.log("[youtube] YOUTUBE_CLIENT_ID/SECRET 미설정 — 업로드 생략");
    return null;
  }
  const { data: tokens, error } = await supabase
    .from("youtube_oauth_tokens")
    .select("refresh_token")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!tokens?.refresh_token) {
    console.log("[youtube] 연동된 채널이 없음 — 업로드 생략 (video_asset_url만 저장)");
    return null;
  }

  const accessToken = await refreshYoutubeAccessToken(tokens.refresh_token);
  if (!accessToken) {
    console.log("[youtube] access token 갱신 실패 — 업로드 생략");
    return null;
  }

  return uploadToYoutube(accessToken, queue.title, queue.script ?? "", videoBuffer);
}

async function main() {
  const { data: queue, error } = await supabase
    .from("content_youtube_queue")
    .select("id, title, script, scenes, video_asset_url")
    .eq("status", "assets_ready")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!queue) {
    console.log("assets_ready 상태의 항목이 없습니다. 종료.");
    return;
  }

  console.log(`대상: ${queue.id} | ${queue.title}`);

  let videoAssetUrl = queue.video_asset_url;
  const dir = mkdtempSync(join(tmpdir(), "dk-video-"));

  try {
    if (!videoAssetUrl) {
      const scenes = queue.scenes ?? [];
      if (scenes.length === 0) throw new Error("scenes가 비어 있습니다.");

      const segmentPaths = [];
      for (let i = 0; i < scenes.length; i++) {
        console.log(`[씬 ${i + 1}/${scenes.length}] 다운로드 + TTS...`);
        const paths = buildSegment(dir, i, scenes[i]);
        await downloadScene(scenes[i], paths);
        // tesseract OCR 체크 — ai_bg 씬만 검사 (verdict_card/phone_ui는 코드 생성이므로 무시)
        const sceneType = scenes[i].sceneType ?? "ai_bg";
        if (sceneType === "ai_bg") {
          const hasKoreanText = detectKoreanTextTesseract(paths.imagePath);
          if (hasKoreanText) {
            console.warn(`  ⚠️  [OCR] 씬 ${i + 1}: 한국어 텍스트 감지됨 (ffmpeg 자막으로 덮어씀, 계속 진행)`);
          } else {
            console.log(`  ✅ [OCR] 씬 ${i + 1}: 텍스트 없음 — 통과`);
          }
        } else {
          console.log(`  ✅ [OCR] 씬 ${i + 1}: ${sceneType} 코드 생성 이미지 — OCR 스킵`);
        }
        console.log(`[씬 ${i + 1}/${scenes.length}] ffmpeg 합성...`);
        const duration = renderSegment(paths);
        console.log(`[씬 ${i + 1}/${scenes.length}] 완료 (${duration.toFixed(1)}s)`);
        segmentPaths.push(paths.segmentPath);
      }

      console.log("세그먼트 합치는 중...");
      const finalPath = join(dir, "final.mp4");
      concatSegments(dir, segmentPaths, finalPath);

      const buffer = readFileSync(finalPath);
      console.log(`final.mp4 크기: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

      videoAssetUrl = await uploadToStorage(`final/${queue.id}.mp4`, buffer, "video/mp4");
      console.log(`업로드 완료: ${videoAssetUrl}`);

      await supabase
        .from("content_youtube_queue")
        .update({ video_asset_url: videoAssetUrl, updated_at: new Date().toISOString() })
        .eq("id", queue.id);
    } else {
      console.log(`기존 video_asset_url 재사용: ${videoAssetUrl}`);
    }

    const videoBuffer = await downloadToFile(videoAssetUrl, join(dir, "for_youtube.mp4"));
    const youtubeVideoId = await tryUploadToYoutube(queue, videoBuffer);

    if (youtubeVideoId) {
      await supabase
        .from("content_youtube_queue")
        .update({
          status: "uploaded",
          youtube_video_id: youtubeVideoId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", queue.id);
      console.log(`유튜브 업로드 완료: https://www.youtube.com/watch?v=${youtubeVideoId} (private)`);
    } else {
      console.log("유튜브 업로드는 생략됨. status=assets_ready 유지 (video_asset_url 저장됨, 재시도 가능)");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

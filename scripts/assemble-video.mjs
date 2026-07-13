/**
 * assets_ready 상태의 유튜브 큐 항목 1건을 가져와
 * 씬 이미지(Ken Burns 줌) + 나레이션(슈퍼톤 → ElevenLabs → edge-tts 순 폴백) + 배경음악(등록돼 있으면) +
 * 자막 번인으로 9:16 영상을 합성하고, Supabase Storage에 업로드(video_asset_url) 후
 * (연동되어 있으면) 유튜브에 비공개로 업로드한다.
 *
 * 요구: ffmpeg/ffprobe (apt-get install ffmpeg), edge-tts (pip install edge-tts, 슈퍼톤/ElevenLabs 미설정 시 폴백),
 *       fonts-noto-cjk (자막 한글 폰트)
 * 선택 env: SUPERTONE_API_KEY + SUPERTONE_VOICE_ID (한국어 특화, 우선순위 1순위 — 가입: supertone.ai/en/api)
 *          ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID (2순위, 둘 다 있어야 사용됨)
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
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim();
const SUPERTONE_API_KEY = process.env.SUPERTONE_API_KEY?.trim();
const SUPERTONE_VOICE_ID = process.env.SUPERTONE_VOICE_ID?.trim();
const SUPERTONE_MODEL = process.env.SUPERTONE_MODEL?.trim() || "sona_speech_1";
const SUPERTONE_MAX_CHARS = 300; // API 자체 제한 — 씬 하나 나레이션 분량엔 보통 충분하지만 넘으면 다음 폴백으로
const BACKGROUND_MUSIC_VOLUME = 0.12;

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

// 전기안전 콘텐츠 특성상 위험/경고성 단어를 자막에서 빨간색으로 강조 — 시선을 붙잡아
// 이탈률을 낮추는 목적(캡컷 등에서 흔히 쓰는 키워드 하이라이트 편집 기법).
const HIGHLIGHT_KEYWORDS = ["위험", "화재", "감전", "누전", "경고", "즉시", "절대", "반드시", "사고", "무료", "특가"];

function escapeAssText(text) {
  return text.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}");
}

function highlightKeywords(line) {
  let result = escapeAssText(line);
  for (const kw of HIGHLIGHT_KEYWORDS) {
    result = result.split(kw).join(`{\\c&H0000FF&}${kw}{\\c&HFFFFFF&}`);
  }
  return result;
}

function formatAssTime(seconds) {
  const cs = Math.round(seconds * 100);
  const hh = Math.floor(cs / 360000);
  const mm = Math.floor((cs % 360000) / 6000);
  const ss = Math.floor((cs % 6000) / 100);
  const cc = cs % 100;
  return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cc).padStart(2, "0")}`;
}

/** drawtext 단색 자막 대신 ASS 자막(libass) 사용 — 씬 하나 전체를 덮는 자막 1개에
 *  위험 키워드만 빨간색으로 강조한다. 박스 배경(BorderStyle=3)으로 기존 drawtext의
 *  boxcolor=black@0.55 느낌을 유지한다. */
function buildAssCaption(narration, duration) {
  const lines = wrapCaption(narration).split("\n").map(highlightKeywords);
  const text = lines.join("\\N");
  const end = formatAssTime(duration);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${CAPTION_FONT},46,&H00FFFFFF,&H000000FF,&H00000000,&H72000000,0,0,0,0,100,100,0,0,3,12,0,2,60,60,110,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${end},Caption,,0,0,0,,${text}
`;
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
  const captionPath = join(dir, `caption_${index}.ass`);
  const segmentPath = join(dir, `segment_${index}.mp4`);

  return { imagePath, audioPath, captionPath, segmentPath };
}

async function synthesizeWithSupertone(text, destPath) {
  const res = await fetch(`https://supertoneapi.com/v1/text-to-speech/${SUPERTONE_VOICE_ID}`, {
    method: "POST",
    headers: { "x-sup-api-key": SUPERTONE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "ko", model: SUPERTONE_MODEL, output_format: "mp3" }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`슈퍼톤 TTS 실패 (${res.status}): ${detail.slice(0, 200)}`);
  }
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function synthesizeWithElevenLabs(text, destPath) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs TTS 실패 (${res.status}): ${detail.slice(0, 200)}`);
  }
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

/**
 * 나레이션 음성 합성 — 우선순위: 슈퍼톤(한국어 특화) → ElevenLabs → 무료 edge-tts.
 * 각 단계는 필요한 env가 없거나 호출이 실패하면 조용히 다음 단계로 넘어간다(필수 설정 아님).
 */
async function synthesizeNarration(text, destPath) {
  if (SUPERTONE_API_KEY && SUPERTONE_VOICE_ID && text.length <= SUPERTONE_MAX_CHARS) {
    try {
      await synthesizeWithSupertone(text, destPath);
      return;
    } catch (err) {
      console.warn("  슈퍼톤 TTS 실패 — 다음 우선순위로 폴백:", err instanceof Error ? err.message : err);
    }
  }

  if (ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID) {
    try {
      await synthesizeWithElevenLabs(text, destPath);
      return;
    } catch (err) {
      console.warn("  ElevenLabs TTS 실패 — edge-tts로 폴백:", err instanceof Error ? err.message : err);
    }
  }

  execFileSync("edge-tts", ["--voice", TTS_VOICE, "--text", text, "--write-media", destPath], {
    stdio: "pipe",
    timeout: 60_000,
  });
}

async function downloadScene(scene, paths) {
  if (!scene.imageUrl) throw new Error("씬 이미지 URL이 없습니다.");
  await downloadToFile(scene.imageUrl, paths.imagePath);
  await synthesizeNarration(scene.narration, paths.audioPath);
  // 자막(.ass)은 나레이션 길이(duration)가 필요해 renderSegment에서 만든다.
}

/** 배경음악 하나를 로테이션으로 선택 (use_count 가장 낮은 것 우선) — 없으면 null */
async function pickBackgroundMusic() {
  const { data, error } = await supabase
    .from("content_media_library")
    .select("*")
    .eq("media_type", "music")
    .order("use_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  await supabase.from("content_media_library").update({ use_count: (data.use_count ?? 0) + 1 }).eq("id", data.id);
  return data.url;
}

/** 나레이션이 담긴 영상에 배경음악을 낮은 볼륨으로 루프 믹싱 (영상 길이에 맞춰 자름) */
function mixBackgroundMusic(videoPath, musicPath, outputPath) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i", videoPath,
      "-stream_loop", "-1",
      "-i", musicPath,
      "-filter_complex",
      `[1:a]volume=${BACKGROUND_MUSIC_VOLUME}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
      "-map", "0:v",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outputPath,
    ],
    { stdio: "pipe" },
  );
}

// 컷마다 아주 짧은 페이드 인/아웃을 넣어 하드컷이 아닌 "확 전환되는" 느낌을 준다
// (영상/오디오 소스가 없어 우쉬 효과음 대신 쓰는 가벼운 대안).
const TRANSITION_FADE_SEC = 0.15;

function renderSegment(paths, narration) {
  const duration = ffprobeDuration(paths.audioPath);
  const frames = Math.ceil(duration * FPS) + FPS;
  writeFileSync(paths.captionPath, buildAssCaption(narration, duration), "utf-8");

  const fadeDur = Math.min(TRANSITION_FADE_SEC, duration / 4);
  const fadeOutStart = Math.max(0, duration - fadeDur).toFixed(3);

  const filter = [
    `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    `zoompan=z='min(zoom+0.0015,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `subtitles='${paths.captionPath}'`,
    `fade=t=in:st=0:d=${fadeDur.toFixed(3)}`,
    `fade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(3)}`,
  ].join(",");
  const audioFilter =
    `afade=t=in:st=0:d=${fadeDur.toFixed(3)},afade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(3)}`;

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
      `${filter}[v];[1:a]${audioFilter}[a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
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
    await assembleQueueItem(queue, videoAssetUrl, dir);
  } catch (err) {
    console.error(`영상 조립 실패 (${queue.id}):`, err);
    // 실패한 항목을 assets_ready에 그대로 두면 다음 실행에서 (updated_at 오름차순 limit 1)
    // 똑같은 항목을 다시 골라 매번 동일하게 크래시한다 (실제로 8일+ 연속 발생했던 문제).
    // approved로 되돌려 다음 "영상 제작 시작" 때 씬을 처음부터 새로 생성하도록 한다.
    await supabase
      .from("content_youtube_queue")
      .update({ status: "approved", scenes: [], video_asset_url: null, updated_at: new Date().toISOString() })
      .eq("id", queue.id);
    await supabase.from("agent_logs").insert({
      level: "error",
      source: "video-assembly",
      message: `영상 조립 실패, approved로 되돌림: ${queue.title} — ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function assembleQueueItem(queue, videoAssetUrlIn, dir) {
  let videoAssetUrl = videoAssetUrlIn;
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
        } else if (sceneType === "real_photo") {
          console.log(`  ✅ [OCR] 씬 ${i + 1}: 실제 사진 사용 — OCR 스킵`);
        } else {
          console.log(`  ✅ [OCR] 씬 ${i + 1}: ${sceneType} 코드 생성 이미지 — OCR 스킵`);
        }
        console.log(`[씬 ${i + 1}/${scenes.length}] ffmpeg 합성...`);
        const duration = renderSegment(paths, scenes[i].narration);
        console.log(`[씬 ${i + 1}/${scenes.length}] 완료 (${duration.toFixed(1)}s)`);
        segmentPaths.push(paths.segmentPath);
      }

      console.log("세그먼트 합치는 중...");
      const concatPath = join(dir, "concat_final.mp4");
      concatSegments(dir, segmentPaths, concatPath);

      let finalPath = concatPath;
      const musicUrl = await pickBackgroundMusic().catch(() => null);
      if (musicUrl) {
        console.log("배경음악 믹싱 중...");
        const musicPath = join(dir, "music.mp3");
        try {
          await downloadToFile(musicUrl, musicPath);
          const withMusicPath = join(dir, "final.mp4");
          mixBackgroundMusic(concatPath, musicPath, withMusicPath);
          finalPath = withMusicPath;
        } catch (err) {
          console.warn("  배경음악 믹싱 실패 — 나레이션만 유지:", err instanceof Error ? err.message : err);
        }
      } else {
        console.log("등록된 배경음악 없음 — 나레이션만 유지");
      }

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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

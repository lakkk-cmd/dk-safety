/**
 * yt-dlp로 자막 미수집 영상의 자막을 가져와 Supabase youtube_videos.transcript에 저장.
 *
 * 요구: yt-dlp CLI 설치 (pip install yt-dlp)
 * Usage: node --env-file=.env.local scripts/fetch-youtube-transcripts.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const MAX_VIDEOS = 20;

function srtToText(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line && !/^\d+$/.test(line) && !line.includes("-->"))
    .join(" ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fetchTranscript(videoId) {
  const dir = mkdtempSync(join(tmpdir(), "yt-sub-"));
  try {
    execFileSync(
      "yt-dlp",
      [
        "--skip-download",
        "--write-auto-sub",
        "--write-sub",
        "--sub-lang",
        "ko,en",
        "--sub-format",
        "vtt",
        "--convert-subs",
        "srt",
        "-o",
        join(dir, "%(id)s.%(ext)s"),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { stdio: "pipe", timeout: 120_000 },
    );

    const srtFile = readdirSync(dir).find((f) => f.endsWith(".srt"));
    if (!srtFile) return null;

    const text = srtToText(readFileSync(join(dir, srtFile), "utf-8"));
    return text || null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: videos, error } = await supabase
  .from("youtube_videos")
  .select("id, video_id, title")
  .is("transcript", null)
  .order("fetched_at", { ascending: false })
  .limit(MAX_VIDEOS);

if (error) {
  console.error("영상 목록 조회 실패:", error.message);
  process.exit(1);
}

if (!videos || videos.length === 0) {
  console.log("자막 수집 대상 없음");
  process.exit(0);
}

console.log(`자막 수집 대상 ${videos.length}건`);

let updated = 0;
let skipped = 0;
let failed = 0;

for (const video of videos) {
  const label = video.title ?? video.video_id;
  try {
    const transcript = fetchTranscript(video.video_id);
    if (!transcript) {
      console.warn(`[skip] ${label}: 자막 없음`);
      skipped++;
      continue;
    }

    const { error: updateError } = await supabase
      .from("youtube_videos")
      .update({ transcript })
      .eq("id", video.id);
    if (updateError) throw updateError;

    updated++;
    console.log(`[ok] ${label}`);
  } catch (err) {
    failed++;
    console.error(`[fail] ${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`완료: 업데이트 ${updated}건, 자막 없음 ${skipped}건, 실패 ${failed}건`);

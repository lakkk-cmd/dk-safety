/**
 * dk-video-factory 로컬 PC 워커 (3단계: 폴링 + TTS + 렌더링)
 *
 * video_jobs에서 status='queued' 작업을 60초 간격으로 가져와
 * 씬별 TTS(mp3) → Remotion Master 컴포지션 렌더링 → Supabase Storage 업로드 후
 * status를 pending_review로 바꾼다. 실패 시 3회 재시도 후 status='error'.
 *
 * 대본(Claude) 생성은 4단계, 승인 후 유튜브 업로드는 6단계에서 추가 —
 * 지금은 scenes(또는 script.scenes)가 수동 입력된 작업만 처리한다.
 * 승인 게이트: 이 워커는 어떤 경로로도 pending_review를 건너뛰고 업로드하지 않는다.
 *
 * Usage: npm run worker (루트에서, .env.local 로드) — 상시 실행은 pm2 권장
 * env: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 선택: WORKER_POLL_MS(기본 60000), WORKER_ONCE=1(작업 1건 처리 후 종료, 테스트용),
 *       TTS_VOICE(기본 ko-KR-SunHiNeural)
 */
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseFile } from "music-metadata";
import { generateScript } from "./script-gen.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_ROOT = path.resolve(__dirname, "..", "remotion");
const ENTRY_POINT = path.join(REMOTION_ROOT, "src", "index.ts");
const PUBLIC_DIR = path.join(REMOTION_ROOT, "public");
const OUT_DIR = path.join(__dirname, "out");

const FPS = 30;
const MIN_SCENE_FRAMES = 60; // 나레이션 없어도 최소 2초
const SCENE_TAIL_SECONDS = 0.4; // 나레이션 끝나고 여유

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TTS_VOICE = process.env.TTS_VOICE || "ko-KR-SunHiNeural";
const POLL_MS = Number(process.env.WORKER_POLL_MS || 60_000);
const RUN_ONCE = process.env.WORKER_ONCE === "1";
const BUCKET = "videos";
const MAX_ATTEMPTS = 3;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다. 루트에서 npm run worker로 실행하세요."
  );
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, ssl: "require", prepare: false });

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

/** scenes(또는 script.scenes)를 {compositionId, props, narration}[]로 정규화 */
function normalizeScenes(job) {
  const raw = Array.isArray(job.scenes)
    ? job.scenes
    : Array.isArray(job.script?.scenes)
      ? job.script.scenes
      : null;
  if (!raw || raw.length === 0) {
    throw new Error("scenes가 없습니다 — 대본 생성이 실패했거나 scenes/script.scenes가 비어 있습니다");
  }
  return raw.map((s, i) => {
    if (!s.compositionId) throw new Error(`scenes[${i}]에 compositionId가 없습니다`);
    return {
      compositionId: String(s.compositionId),
      props: s.props ?? {},
      narration: typeof s.narration === "string" && s.narration.trim() ? s.narration.trim() : null,
    };
  });
}

/** 씬별 나레이션 mp3 생성 (remotion/public/tts/<jobId>/) + 길이 기반 durationInFrames 계산 */
async function synthesizeScenes(jobId, scenes) {
  const relDir = path.posix.join("tts", jobId);
  const absDir = path.join(PUBLIC_DIR, "tts", jobId);
  mkdirSync(absDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  try {
    const result = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.narration) {
        result.push({ ...scene, audio: undefined, durationInFrames: MIN_SCENE_FRAMES + 30 });
        continue;
      }
      // msedge-tts v2: toFile(디렉토리, 텍스트) → {audioFilePath} — 씬별 임시 디렉토리에 쓰고 제자리로 rename
      const tmpDir = path.join(absDir, `.tmp-${i}`);
      mkdirSync(tmpDir, { recursive: true });
      const { audioFilePath } = await tts.toFile(tmpDir, scene.narration);
      const filePath = path.join(absDir, `scene-${i}.mp3`);
      renameSync(audioFilePath, filePath);
      rmSync(tmpDir, { recursive: true, force: true });
      const meta = await parseFile(filePath);
      const seconds = meta.format.duration;
      if (!seconds || seconds <= 0) throw new Error(`scene-${i} TTS 결과 길이를 읽지 못했습니다`);
      result.push({
        ...scene,
        audio: path.posix.join(relDir, `scene-${i}.mp3`),
        durationInFrames: Math.max(MIN_SCENE_FRAMES, Math.ceil((seconds + SCENE_TAIL_SECONDS) * FPS)),
      });
      log(`  TTS scene-${i}: ${seconds.toFixed(1)}s (${scene.narration.slice(0, 30)}…)`);
    }
    return result;
  } finally {
    tts.close();
  }
}

// Remotion 번들은 잡마다 다시 만들 필요가 없어 프로세스 수명 동안 캐시
let bundlePromise = null;
function getBundle() {
  bundlePromise ??= bundle({
    entryPoint: ENTRY_POINT,
    publicDir: PUBLIC_DIR,
    onProgress: () => {},
  });
  return bundlePromise;
}

async function renderJob(jobId, masterScenes) {
  const serveUrl = await getBundle();
  const inputProps = {
    scenes: masterScenes.map(({ compositionId, props, durationInFrames, audio, narration }) => ({
      compositionId,
      props,
      durationInFrames,
      audio,
      caption: narration ?? undefined, // 나레이션을 하단 고정 자막으로
    })),
  };
  const composition = await selectComposition({ serveUrl, id: "Master", inputProps });
  mkdirSync(OUT_DIR, { recursive: true });
  const outputLocation = path.join(OUT_DIR, `${jobId}.mp4`);
  let lastPct = -10;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) {
        lastPct = pct;
        log(`  렌더링 ${pct}%`);
      }
    },
  });
  return outputLocation;
}

async function uploadToStorage(localPath, objectPath) {
  const body = await readFile(localPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) throw new Error(`Storage 업로드 실패 ${res.status}: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function runJob(job) {
  await sql`update video_jobs set status = 'scripting', error = null where id = ${job.id}`;

  // scenes가 수동 입력돼 있으면 그대로 쓰고, 없으면 Claude로 대본 생성 (4단계)
  const hasScenes =
    (Array.isArray(job.scenes) && job.scenes.length > 0) ||
    (Array.isArray(job.script?.scenes) && job.script.scenes.length > 0);
  if (!hasScenes) {
    log(`  대본 생성 시작 (Claude): "${job.topic}"`);
    const script = await generateScript({ topic: job.topic, format: job.format });
    await sql`
      update video_jobs set script = ${sql.json(script)}, scenes = ${sql.json(script.scenes)}
      where id = ${job.id}`;
    job = { ...job, script, scenes: script.scenes };
    log(`  대본 생성 완료: "${script.title}" — 씬 ${script.scenes.length}개`);
  }

  const scenes = normalizeScenes(job);

  log(`  씬 ${scenes.length}개 TTS 시작 (voice: ${TTS_VOICE})`);
  const masterScenes = await synthesizeScenes(job.id, scenes);

  await sql`update video_jobs set status = 'rendering' where id = ${job.id}`;
  const totalFrames = masterScenes.reduce((s, x) => s + x.durationInFrames, 0);
  log(`  렌더링 시작 (${totalFrames}프레임, ${(totalFrames / FPS).toFixed(1)}초)`);
  const localPath = await renderJob(job.id, masterScenes);

  const videoUrl = await uploadToStorage(localPath, `video-jobs/${job.id}.mp4`);
  await sql`
    update video_jobs set
      status = 'pending_review',
      video_path = ${videoUrl},
      audio_path = ${`tts/${job.id}/`},
      scenes = ${sql.json(masterScenes)},
      error = null
    where id = ${job.id}`;
  log(`  완료 → pending_review: ${videoUrl}`);
  // TODO(6단계): Solapi 카카오 알림 "검토하기" 발송
}

async function processJob(job) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await runJob(job);
      return true;
    } catch (e) {
      lastError = e;
      log(`  시도 ${attempt}/${MAX_ATTEMPTS} 실패: ${e?.message ?? String(e)}`);
    }
  }
  await sql`
    update video_jobs set status = 'error', error = ${String(lastError?.message ?? lastError)}
    where id = ${job.id}`;
  log(`  중단 → error 기록`);
  return false;
}

/** queued 작업 1건을 원자적으로 집어온다 (status를 scripting으로 선점) */
async function claimNextJob() {
  const rows = await sql`
    update video_jobs set status = 'scripting'
    where id = (
      select id from video_jobs where status = 'queued' order by created_at asc limit 1
    )
    returning *`;
  return rows[0] ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  log(`워커 시작 — 폴링 ${POLL_MS / 1000}초 간격${RUN_ONCE ? " (1건 처리 후 종료)" : ""}`);
  process.on("SIGINT", async () => {
    log("종료 요청 — DB 연결 정리");
    await sql.end({ timeout: 5 });
    process.exit(0);
  });

  for (;;) {
    let job = null;
    try {
      job = await claimNextJob();
    } catch (e) {
      log(`폴링 실패 (다음 주기에 재시도): ${e.message}`);
    }
    if (job) {
      log(`작업 시작: ${job.id} [${job.format}] "${job.topic}" (요청: ${job.requested_by})`);
      await processJob(job);
      if (RUN_ONCE) break;
      continue; // 연속 작업이 있으면 바로 다음 건
    }
    if (RUN_ONCE) {
      log("대기 중인 작업 없음 — 종료");
      break;
    }
    await sleep(POLL_MS);
  }
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error("워커 치명적 오류:", e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});

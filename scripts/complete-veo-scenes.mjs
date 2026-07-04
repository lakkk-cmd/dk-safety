/**
 * Veo LRO 폴링 완료 스크립트 (GitHub Actions 전용)
 * veo_generating 상태인 큐 항목의 LRO를 폴링하여 영상을 다운로드 + Storage 업로드 후
 * scenes JSONB에 videoUrl 기록, status → assets_ready.
 *
 * 실행: node scripts/complete-veo-scenes.mjs [queueId]
 *   queueId 생략 시 전체 veo_generating 항목 처리
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const GEMINI_KEY    = process.env.GEMINI_API_KEY?.trim();
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY?.trim();
const VEO_MODEL     = process.env.VEO_MODEL?.trim() || "veo-3.1-generate-preview";
const BUCKET        = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
const GEMINI_BASE   = "https://generativelanguage.googleapis.com/v1beta";
const GITHUB_TOKEN  = (process.env.PAT_TOKEN || process.env.GITHUB_TOKEN)?.trim();
const GITHUB_REPO   = process.env.GITHUB_REPO?.trim() || "lakkk-cmd/dk-safety";

// 사람이 GitHub Actions에서 직접 눌러야 했던 최종 합성+업로드 단계(video-assembly.yml)를 자동 트리거한다.
async function triggerVideoAssembly() {
  if (!GITHUB_TOKEN) {
    console.warn("  [video-assembly.yml] GITHUB_TOKEN/PAT_TOKEN 없음 — 트리거 건너뜀");
    return;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/video-assembly.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: {} }),
      },
    );
    if (!res.ok) {
      console.warn(`  [video-assembly.yml] 트리거 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } else {
      console.log("  [video-assembly.yml] 트리거 완료");
    }
  } catch (err) {
    console.warn("  [video-assembly.yml] 트리거 오류:", err);
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Supabase 환경변수 미설정"); process.exit(1); }
if (!GEMINI_KEY)  { console.error("❌ GEMINI_API_KEY 미설정"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TARGET_ID = process.argv[2]?.trim() || null;

// ─── Supabase Storage 업로드 ──────────────────────────────────────────────────
async function uploadToStorage(objectPath, contentType, data) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

// ─── Veo LRO 폴링 ────────────────────────────────────────────────────────────
async function pollVeoLro(lroName) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, 10_000));
    const res = await fetch(`${GEMINI_BASE}/${lroName}?key=${GEMINI_KEY}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { process.stdout.write("."); continue; }
    const op = JSON.parse(await res.text());
    process.stdout.write(`\r  폴링 ${String(attempt + 1).padStart(2)}/60: done=${op.done ?? false}   `);
    if (op.error) throw new Error(`Veo 오류: ${op.error.message ?? JSON.stringify(op.error)}`);
    if (!op.done) continue;
    console.log();
    const video = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video
               ?? op.response?.generatedSamples?.[0]?.video;
    if (!video) throw new Error(`완료 응답에 비디오 없음: ${JSON.stringify(op.response ?? op).slice(0, 300)}`);
    if (video.bytesBase64Encoded) return Buffer.from(video.bytesBase64Encoded, "base64");
    if (video.uri) {
      const dlUrl = video.uri.includes("?") ? `${video.uri}&key=${GEMINI_KEY}` : `${video.uri}?key=${GEMINI_KEY}&alt=media`;
      const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dlRes.ok) throw new Error(`다운로드 실패 ${dlRes.status}`);
      return Buffer.from(await dlRes.arrayBuffer());
    }
    throw new Error("URI도 base64도 없음");
  }
  throw new Error("Veo 폴링 타임아웃 (10분 초과)");
}

// ─── Flux 폴백 이미지 생성 ────────────────────────────────────────────────────
async function generateFluxImage(prompt) {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY 미설정");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "black-forest-labs/flux.2-pro",
      messages: [{ role: "user", content: `${prompt} Negative prompt: no text, no Korean characters, no subtitles.` }],
      modalities: ["image"],
      image_config: { aspect_ratio: "9:16", image_size: "1K" },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Flux 실패 ${res.status}: ${raw.slice(0, 200)}`);
  const json = JSON.parse(raw);
  const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) throw new Error("Flux 이미지 없음");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Flux 응답 형식 오류");
  return { data: Buffer.from(match[2], "base64"), contentType: match[1] };
}

// ─── 단일 큐 항목 완료 처리 ───────────────────────────────────────────────────
async function completeQueueItem(item) {
  const queueId = item.id;
  const lroList = item.veo_lro_names ?? [];
  const scenes = Array.isArray(item.scenes) ? [...item.scenes] : [];

  console.log(`\n▶ [${queueId}] "${item.title?.slice(0, 40)}" — LRO ${lroList.length}개`);

  let allDone = true;

  for (const lroEntry of lroList) {
    const { sceneIndex, lroName, prompt } = lroEntry;
    console.log(`  [씬 ${sceneIndex}] LRO 폴링 시작...`);
    try {
      const videoBuf = await pollVeoLro(lroName);
      const sizeMB = (videoBuf.length / 1024 / 1024).toFixed(1);
      console.log(`  ✓ Veo 완료 (${sizeMB}MB)`);

      const objectPath = `scenes/${queueId}/${sceneIndex}.mp4`;
      const videoUrl = await uploadToStorage(objectPath, "video/mp4", videoBuf);
      console.log(`  ✓ Storage 업로드: ${objectPath}`);

      if (scenes[sceneIndex]) scenes[sceneIndex].videoUrl = videoUrl;
      else scenes[sceneIndex] = { narration: "", imagePrompt: prompt, sceneType: "ai_bg", videoUrl };

      // 비용 로그
      await supabase.from("gemini_usage_log").insert({
        model: VEO_MODEL, operation: "veo_video",
        queue_id: queueId, scene_index: sceneIndex,
        cost_usd: 3.20, success: true,
      }).throwOnError();
    } catch (err) {
      console.error(`  ✗ LRO 실패 [씬 ${sceneIndex}]: ${err.message}`);
      allDone = false;

      // Flux 폴백
      try {
        console.log(`  → Flux 폴백 생성 중...`);
        const { data, contentType } = await generateFluxImage(prompt);
        const ext = contentType.includes("png") ? "png" : "jpg";
        const imageUrl = await uploadToStorage(`scenes/${queueId}/${sceneIndex}.${ext}`, contentType, data);
        if (scenes[sceneIndex]) scenes[sceneIndex].imageUrl = imageUrl;
        else scenes[sceneIndex] = { narration: "", imagePrompt: prompt, sceneType: "ai_bg", imageUrl };
        console.log(`  ✓ Flux 폴백 업로드 완료`);

        await supabase.from("gemini_usage_log").insert({
          model: VEO_MODEL, operation: "veo_video_fallback",
          queue_id: queueId, scene_index: sceneIndex,
          cost_usd: 0, success: false,
        });
        allDone = true; // 폴백 성공 시 완료 처리
      } catch (fluxErr) {
        console.error(`  ✗ Flux 폴백도 실패: ${fluxErr.message}`);
      }
    }
  }

  if (allDone) {
    await supabase.from("content_youtube_queue")
      .update({ scenes, veo_lro_names: null, status: "assets_ready", updated_at: new Date().toISOString() })
      .eq("id", queueId)
      .throwOnError();
    console.log(`  ✅ assets_ready`);
    await triggerVideoAssembly();
  } else {
    console.warn(`  ⚠ 일부 씬 실패. status 유지 (veo_generating).`);
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
console.log("=".repeat(60));
console.log("Veo LRO 완료 처리 (GitHub Actions)");
console.log("=".repeat(60));
console.log(`대상: ${TARGET_ID || "전체 veo_generating 항목"}`);

let query = supabase
  .from("content_youtube_queue")
  .select("id, title, status, scenes, veo_lro_names")
  .eq("status", "veo_generating");

if (TARGET_ID) query = query.eq("id", TARGET_ID);

const { data: items, error } = await query;
if (error) { console.error("❌ DB 조회 실패:", error.message); process.exit(1); }
if (!items?.length) { console.log("처리할 veo_generating 항목 없음."); process.exit(0); }

console.log(`\n${items.length}개 항목 처리 시작...\n`);

for (const item of items) {
  await completeQueueItem(item);
}

console.log("\n" + "=".repeat(60));
console.log("✅ 완료");
console.log("=".repeat(60));

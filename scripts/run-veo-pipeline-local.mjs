/**
 * Veo 3.1 영상 파이프라인 로컬 러너 (Vercel 타임아웃 우회)
 * 프로덕션 Supabase에 직접 접근하여 전체 파이프라인을 실행.
 *
 * 실행: node --env-file=.env.local scripts/run-veo-pipeline-local.mjs <queueId>
 * 예:   node --env-file=.env.local scripts/run-veo-pipeline-local.mjs 03aec903-59a5-499c-8c40-012b7a319701
 */

import { createClient } from "@supabase/supabase-js";

// ─── 환경변수 ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ANTHROPIC_KEY     = process.env.ANTHROPIC_API_KEY?.trim();
const GEMINI_KEY        = process.env.GEMINI_API_KEY?.trim();
const OPENROUTER_KEY    = process.env.OPENROUTER_API_KEY?.trim();
const VEO_MODEL         = process.env.VEO_MODEL?.trim() || "veo-3.1-generate-preview";
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
const BUCKET            = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
const GEMINI_BASE       = "https://generativelanguage.googleapis.com/v1beta";

const QUEUE_ID = process.argv[2] || "03aec903-59a5-499c-8c40-012b7a319701";

// ─── 유효성 검사 ──────────────────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("❌ Supabase 환경변수 미설정"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("❌ ANTHROPIC_API_KEY 미설정"); process.exit(1); }
if (!GEMINI_KEY)    { console.error("❌ GEMINI_API_KEY 미설정"); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("=".repeat(60));
console.log("Veo 3.1 로컬 파이프라인 러너");
console.log("=".repeat(60));
console.log(`큐 ID    : ${QUEUE_ID}`);
console.log(`Veo 모델 : ${VEO_MODEL}`);
console.log(`Gemini   : ${GEMINI_KEY.slice(0,8)}...`);
console.log(`Bucket   : ${BUCKET}`);
console.log();

// ─── Step 1: DB에서 큐 항목 조회 ──────────────────────────────────────────────
console.log("▶ Step 1: 큐 항목 조회...");
const { data: row, error: rowErr } = await supabase
  .from("content_youtube_queue")
  .select("id, title, script, status")
  .eq("id", QUEUE_ID)
  .single();
if (rowErr || !row) { console.error("❌ 항목 조회 실패:", rowErr?.message); process.exit(1); }
if (row.status !== "approved") {
  console.error(`❌ approved 상태가 아님: ${row.status}`);
  process.exit(1);
}
console.log(`✓ [${row.status}] ${row.title}`);

// producing 상태로 변경
await supabase.from("content_youtube_queue")
  .update({ status: "producing", updated_at: new Date().toISOString() })
  .eq("id", QUEUE_ID);
console.log("  → status: producing");

// ─── Step 2: Claude 씬 분해 + Veo 프롬프트 생성 ─────────────────────────────
console.log("\n▶ Step 2: Claude 씬 분해 + Veo 프롬프트 생성...");

const SCENE_SYSTEM = `당신은 우리집 전기주치의(대경이엔피)의 영상 제작 PD이자 Veo 3.1 프롬프트 전문가입니다.
주어진 유튜브 쇼츠(9:16 세로 영상) 스크립트를 5~8개의 씬으로 분해하라.

각 씬:
- narration: 한국어 1~2문장
- sceneType: "ai_bg" | "verdict_card" | "phone_ui"
- imagePrompt: ai_bg 씬만 영어로, 7요소 포함(씬묘사·카메라각도·카메라무브·조명·분위기·동작·스타일). 나머지는 "".
  7요소 마지막은 반드시: "photorealistic documentary style, no readable text, no Korean characters, no signage with text, no subtitles"

JSON만 응답:
\`\`\`json
{"scenes":[{"narration":"...","sceneType":"ai_bg","imagePrompt":"..."}]}
\`\`\``;

const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    system: SCENE_SYSTEM,
    messages: [{ role: "user", content: `제목: ${row.title}\n\n스크립트:\n${row.script}` }],
  }),
  signal: AbortSignal.timeout(120_000),
});
if (!claudeRes.ok) { console.error("❌ Claude API 오류:", await claudeRes.text()); process.exit(1); }
const claudeData = await claudeRes.json();
const rawText = claudeData.content?.[0]?.text ?? "";

// JSON 추출 (중첩 코드블록 대응)
const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
if (!jsonMatch) {
  console.error("❌ JSON 파싱 실패:\n", rawText.slice(0, 500));
  process.exit(1);
}
const { scenes: planned } = JSON.parse(jsonMatch[1]);
console.log(`✓ ${planned.length}개 씬 생성`);
planned.forEach((s, i) => {
  console.log(`   [씬 ${i+1}] ${s.sceneType} — ${s.narration.slice(0,40)}...`);
});

// ─── 예산 체크 ────────────────────────────────────────────────────────────────
const since30 = new Date(Date.now() - 30*24*60*60*1000).toISOString();
const { data: usageLogs } = await supabase.from("gemini_usage_log")
  .select("cost_usd").eq("success", true).gte("created_at", since30);
const usedUsd = (usageLogs ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
const BUDGET_USD = 50000 / 1350;
const aiBgCount = planned.filter(s => s.sceneType === "ai_bg").length;
const estUsd = aiBgCount * 3.20;
console.log(`\n💰 예산: 사용 $${usedUsd.toFixed(2)} + 예상 $${estUsd.toFixed(2)} / 한도 $${BUDGET_USD.toFixed(2)}`);
if (usedUsd + estUsd > BUDGET_USD) {
  console.error(`❌ 예산 한도 초과 예상`); process.exit(1);
}

// ─── Supabase Storage 업로드 헬퍼 (JS 클라이언트 사용) ───────────────────────
async function uploadToStorage(objectPath, contentType, data) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

// ─── Veo 영상 생성 헬퍼 ────────────────────────────────────────────────────────
async function generateVeoVideo(promptText) {
  const submitUrl = `${GEMINI_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${GEMINI_KEY}`;
  console.log(`    제출 중...`);
  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: promptText }],
      parameters: { aspectRatio: "9:16", durationSeconds: 8, sampleCount: 1 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const submitRaw = await submitRes.text();
  if (!submitRes.ok) {
    let detail = submitRaw.slice(0, 400);
    try { detail = JSON.parse(submitRaw).error?.message ?? detail; } catch { /* keep */ }
    throw new Error(`Veo 제출 실패 ${submitRes.status}: ${detail}`);
  }
  const lro = JSON.parse(submitRaw);
  if (!lro.name) throw new Error(`LRO name 없음: ${submitRaw.slice(0,200)}`);
  console.log(`    LRO: ${lro.name.split("/").pop()}`);
  console.log(`    폴링 중 (10초 간격, 최대 10분)...`);

  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(r => setTimeout(r, 10_000));
    const pollRes = await fetch(`${GEMINI_BASE}/${lro.name}?key=${GEMINI_KEY}`, { signal: AbortSignal.timeout(15_000) });
    if (!pollRes.ok) { process.stdout.write("."); continue; }
    const op = JSON.parse(await pollRes.text());
    process.stdout.write(`\r    폴링 ${String(attempt+1).padStart(2)}/60: done=${op.done ?? false}   `);
    if (op.error) throw new Error(`Veo 오류: ${op.error.message ?? JSON.stringify(op.error)}`);
    if (!op.done) continue;

    console.log(); // 줄바꿈
    const video = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video
               ?? op.response?.generatedSamples?.[0]?.video;
    if (!video) throw new Error(`완료 응답에 비디오 없음: ${JSON.stringify(op.response ?? op).slice(0,300)}`);

    if (video.bytesBase64Encoded) {
      return Buffer.from(video.bytesBase64Encoded, "base64");
    }
    if (video.uri) {
      const dlUrl = video.uri.includes("?") ? `${video.uri}&key=${GEMINI_KEY}` : `${video.uri}?key=${GEMINI_KEY}&alt=media`;
      console.log(`    다운로드 중...`);
      const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(120_000) });
      if (!dlRes.ok) throw new Error(`다운로드 실패 ${dlRes.status}`);
      return Buffer.from(await dlRes.arrayBuffer());
    }
    throw new Error("URI도 base64도 없음");
  }
  throw new Error("Veo 타임아웃 (10분 초과)");
}

// ─── Flux 이미지 생성 헬퍼 (폴백) ──────────────────────────────────────────────
async function generateFluxImage(prompt) {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY 미설정");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "black-forest-labs/flux.2-pro",
      messages: [{ role: "user", content: prompt + " Negative prompt: no text, no Korean characters, no subtitles." }],
      modalities: ["image"],
      image_config: { aspect_ratio: "9:16", image_size: "1K" },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Flux 실패 ${res.status}: ${raw.slice(0,200)}`);
  const json = JSON.parse(raw);
  const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) throw new Error("Flux 이미지 없음");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Flux 응답 형식 오류");
  return { data: Buffer.from(match[2], "base64"), contentType: match[1] };
}

// ─── Step 3: 씬별 자산 생성 ───────────────────────────────────────────────────
console.log("\n▶ Step 3: 씬별 자산 생성...");
const scenes = [];

for (let i = 0; i < planned.length; i++) {
  const scene = planned[i];
  const type = scene.sceneType ?? "ai_bg";
  console.log(`\n[씬 ${i+1}/${planned.length}] type=${type}`);
  console.log(`  narration: ${scene.narration.slice(0,60)}...`);

  if (type === "ai_bg") {
    if (scene.imagePrompt) {
      console.log(`  Veo 프롬프트: ${scene.imagePrompt.slice(0,100)}...`);
    }
    try {
      const videoBuf = await generateVeoVideo(scene.imagePrompt);
      const sizeMB = (videoBuf.length / 1024 / 1024).toFixed(1);
      console.log(`  ✓ Veo 완료 (${sizeMB}MB)`);

      const objectPath = `scenes/${QUEUE_ID}/${i}.mp4`;
      const videoUrl = await uploadToStorage(objectPath, "video/mp4", videoBuf);
      console.log(`  ✓ Storage 업로드: ${objectPath}`);

      await supabase.from("gemini_usage_log").insert({
        model: VEO_MODEL, operation: "veo_video",
        queue_id: QUEUE_ID, scene_index: i,
        cost_usd: 3.20, success: true,
      });
      scenes.push({ ...scene, videoUrl });
    } catch (err) {
      console.error(`  ✗ Veo 실패 → Flux 폴백: ${err.message}`);
      await supabase.from("gemini_usage_log").insert({
        model: VEO_MODEL, operation: "veo_video_fallback",
        queue_id: QUEUE_ID, scene_index: i,
        cost_usd: 0, success: false,
      });
      const { data, contentType } = await generateFluxImage(scene.imagePrompt);
      const ext = contentType.includes("png") ? "png" : "jpg";
      const imageUrl = await uploadToStorage(`scenes/${QUEUE_ID}/${i}.${ext}`, contentType, data);
      console.log(`  ✓ Flux 폴백 업로드: scenes/${QUEUE_ID}/${i}.${ext}`);
      scenes.push({ ...scene, imageUrl });
    }
    continue;
  }

  // verdict_card / phone_ui — 빈 placeholder 이미지 (로컬에서 canvas 없이)
  console.log(`  → ${type} 씬: 텍스트 카드 placeholder (로컬 canvas 생략)`);
  scenes.push({ ...scene, imageUrl: "" });
}

// ─── Step 4: DB 업데이트 → assets_ready ────────────────────────────────────────
console.log("\n▶ Step 4: DB 업데이트 → assets_ready...");
const { error: updateErr } = await supabase
  .from("content_youtube_queue")
  .update({ scenes, status: "assets_ready", updated_at: new Date().toISOString() })
  .eq("id", QUEUE_ID);
if (updateErr) { console.error("❌ DB 업데이트 실패:", updateErr.message); process.exit(1); }
console.log("✓ status → assets_ready");

// ─── Step 5: 비용 로그 요약 ───────────────────────────────────────────────────
console.log("\n▶ Step 5: 비용 로그 요약...");
const { data: logs } = await supabase
  .from("gemini_usage_log")
  .select("model, operation, scene_index, cost_usd, success, created_at")
  .eq("queue_id", QUEUE_ID)
  .order("created_at");
let total = 0;
for (const l of logs ?? []) {
  const mark = l.success ? "✓" : "✗";
  console.log(`  ${mark} [씬 ${l.scene_index}] ${l.operation} | $${l.cost_usd} | ${l.model}`);
  total += Number(l.cost_usd);
}
console.log(`  총 Veo 비용: $${total.toFixed(2)} (≈ ${Math.round(total * 1350).toLocaleString()}원)`);

// ─── 완료 요약 ────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("✅ 파이프라인 완료");
console.log(`   큐 ID    : ${QUEUE_ID}`);
console.log(`   씬 수    : ${scenes.length}개`);
const veoScenes = scenes.filter(s => s.videoUrl);
const fluxScenes = scenes.filter(s => s.imageUrl);
console.log(`   Veo 영상 : ${veoScenes.length}개`);
console.log(`   Flux 이미지: ${fluxScenes.length}개`);
console.log(`   Veo 비용 : $${total.toFixed(2)}`);
console.log(`   상태     : assets_ready → GitHub Actions가 영상 합성`);
console.log("=".repeat(60));

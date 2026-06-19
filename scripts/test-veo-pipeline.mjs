/**
 * Veo 3.1 파이프라인 E2E 테스트
 * 실행: node --env-file=.env.local scripts/test-veo-pipeline.mjs
 * Veo 실제 호출: .env.local에 USE_VEO_VIDEO=true 추가 (씬당 ~$3.20 비용 발생)
 */

import postgres from "postgres";
import fs from "fs";
import path from "path";
import url from "url";

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");

const USE_VEO  = process.env.USE_VEO_VIDEO === "true";
const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();
const VEO_MODEL  = process.env.VEO_MODEL?.trim() || "veo-3.1-generate-preview";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim();
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const TEST_TITLE = "[테스트] 아파트 누전차단기 점검법";
const TEST_SCRIPT = `안녕하세요, 대경이엔피 전기주치의입니다.
오늘은 아파트 분전반 누전차단기 점검 방법을 알려드리겠습니다.
분전반 문을 열면 왼쪽에 누전차단기가 있습니다.
테스트 버튼을 눌러보세요. 차단기가 내려가면 정상입니다.
만약 내려가지 않는다면 누전차단기 교체가 필요합니다.
점검이 필요하시면 dkansim.com에서 예약해 주세요.`;

console.log("=".repeat(60));
console.log("Veo 3.1 파이프라인 E2E 테스트");
console.log("=".repeat(60));
console.log(`USE_VEO_VIDEO : ${USE_VEO}`);
console.log(`VEO_MODEL     : ${VEO_MODEL}`);
console.log(`GEMINI_API_KEY: ${GEMINI_KEY ? GEMINI_KEY.slice(0,8)+"..." : "❌ 미설정"}`);
console.log(`ANTHROPIC_KEY : ${ANTHROPIC_KEY ? ANTHROPIC_KEY.slice(0,8)+"..." : "❌ 미설정"}`);
console.log();

if (!ANTHROPIC_KEY) { console.error("ANTHROPIC_API_KEY 미설정"); process.exit(1); }
if (!GEMINI_KEY && USE_VEO) { console.error("GEMINI_API_KEY 미설정 (Veo 호출에 필요)"); process.exit(1); }

// ─── Step 1: Claude 씬 분해 + Veo 프롬프트 생성 ─────────────────────────────
console.log("▶ Step 1: Claude 씬 분해 + Veo 영상 프롬프트 생성...");

const SYSTEM = `당신은 Veo 3.1 영상 프롬프트 전문가입니다.
스크립트를 3~4개 씬으로 분해하고, ai_bg 씬마다 아래 7가지 요소를 모두 포함한 영어 Veo 프롬프트를 작성하라:
1. Scene description (인물·사물·배경 구체 묘사, 한국 아파트 전기설비 현장)
2. Camera angle (예: close-up, low-angle, wide shot)
3. Camera movement (예: slow zoom-in, gentle pan, static)
4. Lighting (예: warm indoor fluorescent, natural daylight)
5. Mood/atmosphere (예: professional and reassuring, calm and informative)
6. Action/motion (씬 안 동작을 시간 순서대로 구체적으로)
7. Visual style: "photorealistic documentary style, no readable text, no Korean characters, no signage with text, no subtitles"
각 프롬프트는 독립 완결, 8초 기준. JSON만 응답:
\`\`\`json
{"scenes":[{"narration":"...","sceneType":"ai_bg","imagePrompt":"..."}]}
\`\`\``;

const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": ANTHROPIC_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM,
    messages: [{ role: "user", content: `제목: ${TEST_TITLE}\n\n스크립트:\n${TEST_SCRIPT}` }],
  }),
  signal: AbortSignal.timeout(60_000),
});

if (!claudeRes.ok) { console.error("Claude API 오류:", await claudeRes.text()); process.exit(1); }

const claudeData = await claudeRes.json();
const rawText = claudeData.content?.[0]?.text ?? "";
const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
if (!jsonMatch) { console.error("JSON 파싱 실패:\n", rawText); process.exit(1); }

const { scenes } = JSON.parse(jsonMatch[1]);
console.log(`✓ ${scenes.length}개 씬 생성 완료\n`);

// ─── Step 2: 생성된 Veo 프롬프트 전문 출력 ────────────────────────────────────
console.log("=".repeat(60));
console.log("▶ Step 2: 생성된 Veo 영상 프롬프트 전문");
console.log("=".repeat(60));
scenes.forEach((s, i) => {
  console.log(`\n[씬 ${i + 1}] sceneType=${s.sceneType}`);
  console.log(`narration: ${s.narration}`);
  if (s.sceneType === "ai_bg") {
    console.log(`\n📝 Veo 프롬프트:\n${s.imagePrompt}`);
  }
  console.log("-".repeat(40));
});

if (!USE_VEO) {
  console.log("\n⚠  USE_VEO_VIDEO=false — Veo 호출 생략 (비용 절약 모드)");
  console.log("Veo 실제 호출: .env.local에 USE_VEO_VIDEO=true 추가 후 재실행");
  // 자연 종료 (process.exit 없이)
} else {

// ─── Step 3: Veo 3.1 호출 (ai_bg 씬 첫 번째 1개만) ──────────────────────────
const aiBgScene = scenes.find(s => s.sceneType === "ai_bg");
if (!aiBgScene) { console.log("ai_bg 씬 없음. 종료."); } else {

console.log("\n" + "=".repeat(60));
console.log("▶ Step 3: Veo 3.1 텍스트→영상 생성 (1씬, 예상 $3.20)");
console.log("=".repeat(60));
console.log(`모델   : ${VEO_MODEL}`);
console.log(`프롬프트: ${aiBgScene.imagePrompt.slice(0, 200)}...`);
console.log("\nVeo API 제출 중...");

const submitRes = await fetch(`${GEMINI_BASE}/models/${VEO_MODEL}:predictLongRunning?key=${GEMINI_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    instances: [{ prompt: aiBgScene.imagePrompt }],
    parameters: { aspectRatio: "9:16", durationSeconds: 8, sampleCount: 1 },
  }),
  signal: AbortSignal.timeout(30_000),
});

const submitRaw = await submitRes.text();
if (!submitRes.ok) {
  let detail = submitRaw.slice(0, 400);
  try { detail = JSON.parse(submitRaw).error?.message ?? detail; } catch { /* keep */ }
  console.error(`❌ Veo 제출 실패 ${submitRes.status}: ${detail}`);
  process.exit(1);
}

const lro = JSON.parse(submitRaw);
if (!lro.name) { console.error("LRO name 없음:", submitRaw); process.exit(1); }
console.log(`✓ LRO 제출: ${lro.name}`);
console.log("폴링 중 (10초 간격, 최대 10분)...");

// ─── 폴링 ─────────────────────────────────────────────────────────────────────
let videoData = null;
for (let attempt = 0; attempt < 60; attempt++) {
  await new Promise(r => setTimeout(r, 10_000));
  const pollRes = await fetch(`${GEMINI_BASE}/${lro.name}?key=${GEMINI_KEY}`, { signal: AbortSignal.timeout(15_000) });
  const op = JSON.parse(await pollRes.text());
  process.stdout.write(`  폴링 ${String(attempt + 1).padStart(2)}/60: done=${op.done ?? false}\r`);
  if (op.error) { console.error("\n❌ Veo 오류:", op.error.message ?? JSON.stringify(op.error)); process.exit(1); }
  if (!op.done) continue;
  // predictLongRunning 완료 응답 구조 파싱 (predictions[] 또는 generatedSamples[])
  console.log("\n[완료 응답 raw]", JSON.stringify(op.response ?? op, null, 2).slice(0, 800));
  // predictLongRunning 응답: response.generateVideoResponse.generatedSamples
  videoData = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video
           ?? op.response?.generatedSamples?.[0]?.video;
  break;
}

if (!videoData) { console.error("\n❌ Veo 타임아웃 (10분 초과)"); process.exit(1); }
console.log(`\n✓ Veo 생성 완료  (mimeType: ${videoData.mimeType ?? "video/mp4"})`);

// ─── 영상 저장 ────────────────────────────────────────────────────────────────
let videoBuf;
if (videoData.bytesBase64Encoded) {
  videoBuf = Buffer.from(videoData.bytesBase64Encoded, "base64");
} else if (videoData.uri) {
  const dlUrl = videoData.uri.includes("?") ? `${videoData.uri}&key=${GEMINI_KEY}` : `${videoData.uri}?key=${GEMINI_KEY}&alt=media`;
  console.log(`다운로드 중: ${videoData.uri.slice(0, 80)}...`);
  const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(120_000) });
  if (!dlRes.ok) { console.error("다운로드 실패:", dlRes.status); process.exit(1); }
  videoBuf = Buffer.from(await dlRes.arrayBuffer());
} else {
  console.error("❌ URI도 base64도 없음:", JSON.stringify(videoData));
  process.exit(1);
}

const outPath = path.join(root, "test-veo-output.mp4");
fs.writeFileSync(outPath, videoBuf);
console.log(`✓ 영상 저장: ${outPath} (${(videoBuf.length / 1024 / 1024).toFixed(1)}MB)`);

// ─── Step 4: 비용 로그 기록 ───────────────────────────────────────────────────
console.log("\n▶ Step 4: 비용 로그 기록...");
const DB_URL = process.env.DATABASE_URL?.trim();
if (DB_URL) {
  const sql = postgres(DB_URL, { max: 1, ssl: "require" });
  try {
    const COST = 3.20;
    await sql`INSERT INTO gemini_usage_log (model, operation, queue_id, scene_index, cost_usd, success)
              VALUES (${VEO_MODEL}, 'veo_video', 'test-e2e', 0, ${COST}, true)`;
    const rows = await sql`SELECT id, model, operation, cost_usd, created_at FROM gemini_usage_log ORDER BY created_at DESC LIMIT 5`;
    console.log("✓ 비용 로그 기록 완료:");
    for (const r of rows) {
      console.log(`  [${r.id}] ${r.model} | ${r.operation} | $${r.cost_usd} | ${r.created_at}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
} else {
  console.log("DATABASE_URL 없음 — DB 로그 생략");
}

console.log("\n" + "=".repeat(60));
console.log("✅ E2E 테스트 완료");
console.log(`   영상 파일: ${outPath}`);
console.log(`   Veo 비용 : $3.20 (8초 × $0.40/초 추정치)`);
console.log("=".repeat(60));
} // end if aiBgScene
} // end if USE_VEO

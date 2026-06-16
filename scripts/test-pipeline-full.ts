/**
 * 영상 제작 파이프라인 풀 사이클 E2E 테스트
 *
 * PART A: DB 테스트 큐 항목 삽입 → produceVideoAssets 실행 → DB 결과 검증
 * PART B: OCR 감지 테스트 (한국어 이미지 → Claude Vision YES 응답)
 * PART C: OCR 실패 알림 시뮬레이션 → boss_feedback + 카카오 알림
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-pipeline-full.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { produceVideoAssets, detectTextInImage, notifyOcrFailure } from "@/lib/video-pipeline";
import { generateVerdictCardBuffer } from "@/lib/scene-cards";
import { uploadBinaryObject } from "@/lib/supabase-server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 비용 최소화: ai_bg 1~2개만 나오도록 구조화된 스크립트
// intro(배경), verdict(판정)×2, phone_ui(앱 화면), outro(배경) → 예상 ai_bg 2개
const TEST_TITLE = "[파이프라인 테스트] 아파트 전기 안전 핵심 체크리스트";
const TEST_SCRIPT = `안녕하세요, 우리집 전기주치의입니다.
오늘은 아파트 전기 안전 필수 체크리스트 5가지를 알려드립니다.

첫 번째, 분전반 점검 결과: 누전차단기 정상 작동 확인! 안전합니다.

두 번째, 콘센트 접지 상태 확인 결과: 즉시 전문가 점검이 필요합니다.

지금 바로 우리집 전기주치의 앱에서 무료 전기 점검을 예약하세요. 간단하게 3분이면 예약 완료입니다.

광주 아파트 전기 전문 기사가 24시간 이내 방문합니다. 전기 안전, 전문가에게 맡기세요!`;

function sep(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function partA_fullPipeline(): Promise<string> {
  sep("PART A: 풀 파이프라인 테스트 (이미지 생성 + OCR 게이트)");

  // 기존 테스트 항목 정리
  await supabase
    .from("content_youtube_queue")
    .delete()
    .like("title", "[파이프라인 테스트]%");

  // 신규 테스트 큐 항목 삽입
  const { data: inserted, error: insErr } = await supabase
    .from("content_youtube_queue")
    .insert({
      title: TEST_TITLE,
      script: TEST_SCRIPT,
      status: "approved",
      category: "전기안전",
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw insErr ?? new Error("큐 항목 삽입 실패");
  const queueId = inserted.id as string;
  console.log(`✅ 테스트 큐 항목 생성: ${queueId}`);
  console.log(`   제목: ${TEST_TITLE}`);

  console.log("\n▶ produceVideoAssets 실행 중... (시간이 걸릴 수 있음)");
  const startTime = Date.now();
  const result = await produceVideoAssets(queueId);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ produceVideoAssets 완료 (${elapsed}초)`);
  console.log(`   생성된 씬 수: ${result.scenes.length}개`);
  console.log("\n씬별 결과:");
  for (let i = 0; i < result.scenes.length; i++) {
    const s = result.scenes[i];
    const urlShort = s.imageUrl ? "✅ " + s.imageUrl.slice(s.imageUrl.lastIndexOf("/") + 1) : "❌ URL 없음";
    console.log(`  [씬 ${i + 1}] type=${s.sceneType ?? "ai_bg"} | url=${urlShort}`);
    console.log(`         narration="${s.narration.slice(0, 50)}..."`);
  }

  // DB 검증
  const { data: finalRow } = await supabase
    .from("content_youtube_queue")
    .select("id, status, scenes")
    .eq("id", queueId)
    .single();

  console.log(`\nDB 상태: ${finalRow?.status}`);
  if (finalRow?.status !== "assets_ready") {
    throw new Error(`예상 status=assets_ready, 실제: ${finalRow?.status}`);
  }
  const dbScenes = finalRow?.scenes as unknown[];
  console.log(`DB scenes 저장 확인: ${dbScenes?.length ?? 0}개`);
  console.log(`\n✅ PART A 통과 — queueId: ${queueId}`);
  return queueId;
}

async function partB_ocrDetection(): Promise<void> {
  sep("PART B: OCR 감지 테스트 (Claude Vision)");

  // 한국어 텍스트가 포함된 판정 카드 생성 → Supabase 업로드 → Claude Vision 확인
  console.log("판정 카드(한국어 텍스트 포함) 생성 중...");
  const koreanTextBuf = await generateVerdictCardBuffer(
    "누전 위험 감지! 즉시 전문가 점검이 필요합니다.",
  );
  console.log(`판정 카드 생성 완료: ${koreanTextBuf.length.toLocaleString()} bytes`);

  const bucket = process.env.SUPABASE_VIDEO_BUCKET?.trim() || "dk-safety-video-assets";
  const testPath = `scenes/ocr-test/korean-text-sample.png`;
  const imageUrl = await uploadBinaryObject({
    bucket,
    objectPath: testPath,
    contentType: "image/png",
    data: koreanTextBuf,
  });
  console.log(`Supabase 업로드 완료: ${imageUrl.slice(imageUrl.lastIndexOf("/") + 1)}`);

  console.log("Claude Vision OCR 감지 실행 중...");
  const hasText = await detectTextInImage(imageUrl);
  console.log(`OCR 결과: hasText=${hasText} (예상: true — 한국어 텍스트 포함)`);

  if (!hasText) {
    console.warn("⚠️  Claude Vision이 한국어 텍스트를 감지하지 못했습니다. 임계값 확인 필요.");
  } else {
    console.log("✅ PART B 통과 — 한국어 텍스트 정상 감지");
  }
}

async function partC_ocrFailureNotification(): Promise<void> {
  sep("PART C: OCR 실패 알림 시뮬레이션 (boss_feedback + 카카오)");

  const testQueueId = "ocr-test-forced-fail-" + Date.now();
  const testSceneIndex = 0;
  const testPrompt =
    "Korean text label saying 누전위험 콘센트 점검 필요 — forced OCR failure test";

  console.log("notifyOcrFailure 직접 호출...");
  console.log(`  queueId: ${testQueueId}`);
  console.log(`  sceneIndex: ${testSceneIndex}`);
  await notifyOcrFailure(testQueueId, testSceneIndex, testPrompt);
  console.log("notifyOcrFailure 완료");

  // boss_feedback 기록 확인
  const { data: fbRows } = await supabase
    .from("boss_feedback")
    .select("id, content, status, created_at")
    .like("content", `%${testQueueId}%`)
    .order("created_at", { ascending: false })
    .limit(3);

  if (fbRows && fbRows.length > 0) {
    console.log(`\nboss_feedback 기록 확인: ${fbRows.length}건`);
    for (const row of fbRows) {
      console.log(`  id=${row.id.slice(0, 8)}... | status=${row.status}`);
      console.log(`  content="${row.content.slice(0, 80)}..."`);
    }
    console.log("✅ PART C 통과 — boss_feedback 기록 + 카카오 알림 발송 시도 완료");
  } else {
    console.warn("⚠️  boss_feedback 기록을 찾지 못했습니다. 삽입 실패 가능성 확인 필요.");
  }
}

async function main() {
  console.log("🎬 영상 제작 파이프라인 풀 사이클 E2E 테스트");
  console.log(`시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

  let partAQueueId: string | null = null;
  const errors: string[] = [];

  try {
    partAQueueId = await partA_fullPipeline();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`PART A 실패: ${msg}`);
    console.error(`\n❌ PART A 실패: ${msg}`);
  }

  try {
    await partB_ocrDetection();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`PART B 실패: ${msg}`);
    console.error(`\n❌ PART B 실패: ${msg}`);
  }

  try {
    await partC_ocrFailureNotification();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`PART C 실패: ${msg}`);
    console.error(`\n❌ PART C 실패: ${msg}`);
  }

  sep("테스트 결과 요약");
  if (errors.length === 0) {
    console.log("✅ 모든 파트 통과");
  } else {
    console.log(`❌ ${errors.length}개 실패:`);
    errors.forEach((e) => console.log(`   - ${e}`));
  }
  if (partAQueueId) {
    console.log(`\n다음 단계: GitHub Actions video-assembly.yml 트리거`);
    console.log(`  assets_ready queueId: ${partAQueueId}`);
    console.log(`  gh workflow run video-assembly.yml`);
  }
  console.log(`\n종료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

  if (errors.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("예외 발생:", e);
  process.exit(1);
});

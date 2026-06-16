/**
 * exam_prep 카테고리 (자격시험) 영상 파이프라인 테스트
 *
 * 1. 자격시험 카테고리 큐 항목 삽입
 * 2. draftYoutubeScript (자격시험 분기) — 스크립트 + 썸네일 기획 출력
 * 3. produceVideoAssets — 씬 이미지 생성
 * 4. video-assembly.yml 트리거 — 최종 MP4 + YouTube 업로드
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-exam-prep-pipeline.ts
 */

import { createClient } from "@supabase/supabase-js";
import { draftYoutubeScript } from "@/lib/content-agents";
import { produceVideoAssets } from "@/lib/video-pipeline";
import { getCurrentWeekStatus } from "@/lib/agents";
import { execSync } from "node:child_process";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const EXAM_TITLE = "[자격시험] 전기이론 기출 — 단상교류 역률 계산 완전정복";
const EXAM_BRIEF = `전기기사/전기공사기사 필기 전기이론 파트 기출 유형.
문제: 단상교류회로에서 임피던스 Z = 6+8j Ω일 때 역률(Power Factor)을 구하여라.
대표 본인 합격 경험 + 현장 경험 바탕으로 쉽게 풀이. 수험생 대상 동기부여 포함.
구성: 인트로(이 영상으로 역률 계산 마스터) → 개념 설명(임피던스·역률) → 단계별 풀이 → 핵심 정리 → 구독 유도.
법적 재구성 주의사항 자연스럽게 1회 언급 필수.`;

function sep(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function main() {
  console.log("🎓 exam_prep 카테고리 영상 파이프라인 테스트");
  console.log(`시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

  // ─── Step 1: 기존 테스트 항목 정리 + 신규 삽입 ────────────────────────────────
  sep("STEP 1: 자격시험 큐 항목 삽입");
  await supabase.from("content_youtube_queue").delete().like("title", "[자격시험]%");

  const { data: inserted, error: insErr } = await supabase
    .from("content_youtube_queue")
    .insert({
      title: EXAM_TITLE,
      competitor_notes: EXAM_BRIEF,
      category: "자격시험",
      status: "planning",
    })
    .select("id")
    .single();
  if (insErr || !inserted) { console.error("삽입 실패:", insErr); process.exit(1); }
  const queueId = inserted.id as string;
  console.log(`✅ 큐 항목 생성: ${queueId}`);

  // ─── Step 2: 자격시험 카테고리 스크립트 생성 ─────────────────────────────────
  sep("STEP 2: 자격시험 분기 스크립트 생성 (draftYoutubeScript)");
  const weekStatus = getCurrentWeekStatus();
  console.log("Claude API 호출 중 (자격시험 분기)...");
  const draft = await draftYoutubeScript(EXAM_TITLE, EXAM_BRIEF, weekStatus, "자격시험");

  console.log("\n▶ 생성된 스크립트:");
  console.log(draft.script.split("\n").map((l: string) => `  ${l}`).join("\n"));

  console.log("\n▶ 썸네일 기획:");
  console.log(draft.thumbnailConcept.split("\n").map((l: string) => `  ${l}`).join("\n"));

  // 법적 재구성 문구 포함 여부 확인
  const hasLegalNote = /재구성|본인의 이해|현장 경험/.test(draft.script);
  console.log(`\n법적 재구성 문구 포함: ${hasLegalNote ? "✅" : "⚠️ 미포함 — 프롬프트 확인 필요"}`);
  // 시험대비 키워드 포함 여부
  const hasExamKeywords = /역률|임피던스|전기이론|기출|수험|자격/.test(draft.script);
  console.log(`시험대비 키워드 포함: ${hasExamKeywords ? "✅" : "⚠️ 미포함"}`);

  // DB에 스크립트 저장 + approved 상태로 변경
  await supabase
    .from("content_youtube_queue")
    .update({
      script: draft.script,
      thumbnail_concept: draft.thumbnailConcept,
      status: "approved",
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueId);
  console.log("\n✅ 스크립트 저장 + status=approved");

  // ─── Step 3: 씬 이미지 생성 (produceVideoAssets) ────────────────────────────
  sep("STEP 3: 씬 이미지 생성 (Flux + OCR 게이트)");
  console.log("produceVideoAssets 실행 중... (시간 소요)");
  const startTime = Date.now();
  const result = await produceVideoAssets(queueId);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n✅ ${result.scenes.length}개 씬 생성 완료 (${elapsed}초)`);
  for (let i = 0; i < result.scenes.length; i++) {
    const s = result.scenes[i];
    const urlShort = s.imageUrl ? s.imageUrl.slice(s.imageUrl.lastIndexOf("/") + 1) : "없음";
    console.log(`  씬 ${i + 1}: type=${s.sceneType ?? "ai_bg"} | ${urlShort}`);
  }

  const { data: finalRow } = await supabase
    .from("content_youtube_queue")
    .select("status")
    .eq("id", queueId)
    .single();
  console.log(`DB 상태: ${finalRow?.status}`);

  // ─── Step 4: video-assembly.yml 트리거 ──────────────────────────────────────
  sep("STEP 4: GitHub Actions video-assembly.yml 트리거");
  try {
    execSync("gh workflow run video-assembly.yml", { cwd: process.cwd(), stdio: "pipe" });
    console.log("✅ video-assembly.yml 트리거 완료");
    console.log(`   assets_ready queueId: ${queueId}`);
    console.log("   GitHub Actions에서 ffmpeg 합성 + YouTube 업로드 진행됩니다.");
    console.log("   진행 확인: gh run list --workflow=video-assembly.yml --limit=3");
  } catch (e) {
    console.error("❌ 워크플로우 트리거 실패:", e instanceof Error ? e.message : e);
  }

  console.log(`\n종료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  console.log(`큐 ID: ${queueId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

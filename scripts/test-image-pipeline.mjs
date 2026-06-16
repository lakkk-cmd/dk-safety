/**
 * 영상/이미지 파이프라인 한글 안정화 테스트
 * - 판정 카드 10개 생성 + 검증
 * - 폰 UI 미리보기 10개 생성 + 검증
 *
 * Usage: node --env-file=.env.local scripts/test-image-pipeline.mjs
 */

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "test-output");
mkdirSync(OUT_DIR, { recursive: true });

// next/og ImageResponse를 ESM에서 직접 호출하려면 tsx/ts-node 필요
// 대신 API route 방식 우회: 직접 satori 사용
// → 여기서는 TS 모듈을 require 불가이므로 tsx로 실행하거나
//   별도 wrapper를 사용한다.
// 이 스크립트는 tsx를 통해 실행됨 (package.json scripts 또는 직접)

console.log("🎬 영상 파이프라인 한글 안정화 테스트");
console.log("=".repeat(50));

// ─── tsx wrapper import ────────────────────────────────────────────────────────
// 이 파일은 node --env-file=.env.local scripts/test-image-pipeline.mjs 로 실행하지 말고
// npx tsx --env-file=.env.local scripts/test-image-pipeline.mjs 로 실행할 것
// (TS 모듈 import 필요)

let generateVerdictCardBuffer, generatePhoneUiBuffer;
try {
  // Dynamic import of TS module via tsx (or compiled output)
  const mod = await import("../src/lib/scene-cards.js").catch(() => null)
    ?? await import("../src/lib/scene-cards.tsx").catch(() => null);
  if (!mod) throw new Error("scene-cards 모듈을 불러올 수 없습니다. tsx로 실행하세요.");
  generateVerdictCardBuffer = mod.generateVerdictCardBuffer;
  generatePhoneUiBuffer = mod.generatePhoneUiBuffer;
} catch (e) {
  console.error("❌ 모듈 로드 실패:", e.message);
  console.log("\n💡 실행 방법: npx tsx --env-file=.env.local scripts/test-image-pipeline.mjs");
  process.exit(1);
}

// ─── 테스트 데이터 ────────────────────────────────────────────────────────────

const VERDICT_NARRATIONS = [
  "누전 차단기가 정상 작동합니다. 안전한 상태입니다.",
  "분전반 점검 결과 모든 회로가 정상입니다.",
  "콘센트 접지 상태가 양호합니다. 걱정 없이 사용하세요.",
  "전기 배선 절연 저항이 기준치 이상입니다.",
  "위험! 누전 의심 구간이 감지되었습니다. 즉시 점검 필요.",
  "주의: 과부하 징후가 발견되었습니다. 전문가 상담을 권장합니다.",
  "에어컨 전용 회로가 안전하게 설치되어 있습니다.",
  "욕실 방수 콘센트 상태 양호. 감전 위험 없음.",
  "스위치 접점 불량 발견. 교체를 권장합니다.",
  "전체 전기 안전 점검 완료. 합격 판정.",
];

const PHONE_NARRATIONS = [
  "지금 바로 앱에서 무료 전기 점검을 예약하세요.",
  "3분이면 예약 완료! 아파트 전기 점검 신청하기.",
  "카카오톡으로 간편하게 예약 확인 문자를 받으세요.",
  "예약 후 24시간 이내 전문 기사가 방문합니다.",
  "광주 아파트 전기 점검, 무료 상담 신청 가능합니다.",
  "앱 하나로 예약부터 결과 확인까지 모두 해결하세요.",
  "우리집 전기 안전, 전문가에게 맡기세요.",
  "정기 점검 알림을 설정하면 자동으로 리마인드해 드립니다.",
  "야간 긴급 전기 문제도 빠른 출동으로 해결합니다.",
  "첫 점검 무료! 지금 바로 예약하세요.",
];

// ─── 생성 + 검증 ─────────────────────────────────────────────────────────────

async function runTests() {
  const results = { verdict: [], phoneUi: [], passed: 0, failed: 0 };
  const MIN_SIZE = 10_000; // 최소 10KB — 정상 PNG라면 훨씬 큼

  console.log("\n📋 판정 카드 10개 생성...");
  for (let i = 0; i < VERDICT_NARRATIONS.length; i++) {
    const narration = VERDICT_NARRATIONS[i];
    const outPath = join(OUT_DIR, `verdict_card_${String(i + 1).padStart(2, "0")}.png`);
    try {
      const buf = await generateVerdictCardBuffer(narration);
      writeFileSync(outPath, buf);
      const ok = buf.length >= MIN_SIZE;
      results.verdict.push({ index: i + 1, size: buf.length, ok, narration: narration.slice(0, 30) });
      if (ok) results.passed++;
      else results.failed++;
      console.log(`  [${ok ? "✅" : "❌"}] verdict_card_${String(i + 1).padStart(2, "0")}.png — ${buf.length.toLocaleString()} bytes`);
    } catch (e) {
      results.verdict.push({ index: i + 1, size: 0, ok: false, narration: narration.slice(0, 30), error: e.message });
      results.failed++;
      console.error(`  [❌] verdict_card_${i + 1}: ${e.message}`);
    }
  }

  console.log("\n📱 폰 UI 미리보기 10개 생성...");
  for (let i = 0; i < PHONE_NARRATIONS.length; i++) {
    const narration = PHONE_NARRATIONS[i];
    const outPath = join(OUT_DIR, `phone_ui_${String(i + 1).padStart(2, "0")}.png`);
    try {
      const buf = await generatePhoneUiBuffer(narration);
      writeFileSync(outPath, buf);
      const ok = buf.length >= MIN_SIZE;
      results.phoneUi.push({ index: i + 1, size: buf.length, ok, narration: narration.slice(0, 30) });
      if (ok) results.passed++;
      else results.failed++;
      console.log(`  [${ok ? "✅" : "❌"}] phone_ui_${String(i + 1).padStart(2, "0")}.png — ${buf.length.toLocaleString()} bytes`);
    } catch (e) {
      results.phoneUi.push({ index: i + 1, size: 0, ok: false, narration: narration.slice(0, 30), error: e.message });
      results.failed++;
      console.error(`  [❌] phone_ui_${i + 1}: ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 테스트 결과: ${results.passed}/20 통과, ${results.failed} 실패`);

  const files = readdirSync(OUT_DIR).filter(f => f.endsWith(".png"));
  console.log(`\n📁 출력 파일 (${files.length}개): ${OUT_DIR}`);
  files.forEach(f => {
    const size = readFileSync(join(OUT_DIR, f)).length;
    console.log(`   ${f} — ${size.toLocaleString()} bytes`);
  });

  if (results.failed > 0) {
    console.error("\n❌ 일부 테스트 실패");
    process.exit(1);
  } else {
    console.log("\n✅ 모든 이미지 생성 성공 — 한글 렌더링 테스트 완료");
  }
}

runTests().catch(e => { console.error(e); process.exit(1); });

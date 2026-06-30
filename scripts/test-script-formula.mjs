/**
 * 검증된 대본 구조 공식 (제목 4요소 + 구어체/반전구조 + 콘티 마스터 캐릭터 시트 안내) 테스트
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-script-formula.mjs
 */

const { draftYoutubeScript } = await import("../src/lib/content-agents.ts");
const { planVideoScenes } = await import("../src/lib/video-pipeline.ts");

const MASTER_CHARACTER_SHEET_NOTE = "[마스터 캐릭터 시트를 함께 입력하세요]";

const TEST_TITLE = "분전반에서 이 소리 나면 절대 무시하지 마세요";
const TEST_BRIEF =
  "경쟁 채널 분석: 분전반 이상 소음(웅웅거림/지지직)을 다룬 영상들이 조회수가 높음. " +
  "대부분 '소리가 나면 위험하다'까지만 말하고 원인(접점 불량/과부하/누전)을 구체적으로 설명하지 않음. " +
  "우리 채널은 현직 전기팀장 경험을 살려 소리 종류별 원인과 대처법을 구체적으로 짚어주는 각도로 차별화.";

console.log("=".repeat(70));
console.log("1) draftYoutubeScript() — 제목 4요소 공식 + 구어체/반전 구조 검증");
console.log("=".repeat(70));

const draft = await draftYoutubeScript(TEST_TITLE, TEST_BRIEF, undefined, "전기안전");

console.log("\n--- 제목 후보 5개 (대상+극단적 수식어+행위+결과에 대한 의문) ---");
draft.titleCandidates.forEach((t, i) => console.log(`${i + 1}. ${t}`));

console.log("\n--- 썸네일 기획 ---");
console.log(draft.thumbnailConcept);

console.log("\n--- 스크립트 전문 ---");
console.log(draft.script);

console.log("\n".repeat(2));
console.log("=".repeat(70));
console.log("2) planVideoScenes() — 콘티 생성 + 씬별 마스터 캐릭터 시트 안내 검증");
console.log("=".repeat(70));

const conti = await planVideoScenes(TEST_TITLE, draft.script);

console.log("\n--- 콘티 요약 ---");
console.log(conti.contiSummary);
console.log("\n반복 시각 모티프:", conti.visualMotif ?? "(없음)");

console.log(`\n--- 씬 목록 (${conti.scenes.length}씬) — UI에서 Flow용 프롬프트에 안내문구가 붙는지 시뮬레이션 ---`);
for (const [i, s] of conti.scenes.entries()) {
  const flowPromptAsShownInUi = s.imagePrompt ? `${MASTER_CHARACTER_SHEET_NOTE}\n${s.imagePrompt}` : "(프롬프트 없음)";
  console.log(`\n[씬 ${i + 1}] ${s.sceneType ?? "?"} / ${s.emotionTone ?? "?"}`);
  console.log(`  한국어 요약: ${s.koreanSummary ?? ""}`);
  console.log(`  나레이션: ${s.narration}`);
  console.log(`  Flow용 프롬프트(안내문구 포함):\n  ${flowPromptAsShownInUi}`);
}

console.log("\n--- 완료 ---");

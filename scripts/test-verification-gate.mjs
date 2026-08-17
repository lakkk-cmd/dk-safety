/**
 * 지시 검증 게이트(verifyContentBriefWithMarketer / verifyIssueWithTechMarketer 동등 로직) 검증.
 * 정상적인 지시는 통과(concern: null), 명백히 어긋난 지시는 차단(concern: 문자열)되는지 확인.
 * Usage: npx tsx --env-file=.env.local scripts/test-verification-gate.mjs
 */
const { verifyContentBriefWithMarketer } = await import("../src/lib/content-agents.ts");

console.log("=== 케이스 1: 정상적인 지시 (통과 기대) ===");
const ok = await verifyContentBriefWithMarketer(
  "장마철 아파트 누전 위험 3가지",
  "장마철 습기로 인한 누전 위험과 예방법을 안내하는 전기안전 영상. 실제 점검 사례 포함.",
  "전기안전",
);
console.log(ok);

console.log("\n=== 케이스 2: 명백히 어긋난 지시 (차단 기대) ===");
const bad = await verifyContentBriefWithMarketer(
  "강아지 사료 추천 유튜브 영상",
  "인기 강아지 사료 브랜드 TOP 5를 리뷰하는 영상. 전기안전과 무관.",
  "전기안전",
);
console.log(bad);

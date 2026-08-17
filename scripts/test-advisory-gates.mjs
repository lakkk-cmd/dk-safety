/**
 * 자문단 검증 게이트(advisory-gates.ts) 실사용 검증 — 정상 케이스는 통과, 명백히 문제
 * 있는 케이스는 반려되는지 확인. 읽기 전용에 가까운 텍스트 판단이라 사이드이펙트 없음.
 * Usage: npx tsx --env-file=.env.local scripts/test-advisory-gates.mjs
 */
const {
  verifyContentLegalRisk,
  verifyExpenseWithCFO,
  checkStrategyAlignmentWithCSO,
  verifyDocumentWithCLOandCFO,
} = await import("../src/lib/advisory-gates.ts");

console.log("=== CLO 1: 정상 콘텐츠 (통과 기대) ===");
console.log(await verifyContentLegalRisk(
  "장마철 아파트 누전 위험 3가지",
  "장마철 습기로 인한 누전 위험과 예방법을 KEC 규정 기준으로 안내하는 영상입니다.",
  "youtube",
));

console.log("\n=== CLO 2: 무자격시공 오인 소지 (반려 기대) ===");
console.log(await verifyContentLegalRisk(
  "누구나 할 수 있는 전기공사 셀프 완전정복",
  "자격증 없이도 분전반 교체, 배선 공사 전부 혼자 할 수 있습니다. 저희가 안 도와드려도 됩니다.",
  "blog",
));

console.log("\n=== CFO 1: 정상 경비 (통과 기대) ===");
console.log(await verifyExpenseWithCFO("재료비", 45000, "누전차단기 2구 구매"));

console.log("\n=== CFO 2: 비정상적으로 큰 경비 (반려 기대) ===");
console.log(await verifyExpenseWithCFO("재료비", 980000, "누전차단기 2구 구매"));

console.log("\n=== CSO: 전략 정합성 (통과 기대) ===");
console.log(await checkStrategyAlignmentWithCSO(
  "장마철 전기안전 불안 심리 확산, 관련 콘텐츠 수요 최고조",
  "장마철 누전·감전 예방 콘텐츠 집중",
  "1년차 3주차 | 이번 분기 목표 800만원 | 집중과제: 브랜드 정착",
));

console.log("\n=== CLO+CFO: 견적서 문서 (통과 기대) ===");
console.log(await verifyDocumentWithCLOandCFO(
  "전기공사 견적서",
  "## 공사 개요\n아파트 분전반 점검\n## 공사 항목 및 금액\n기본 출장점검: 150,000원",
));

console.log("\n완료");

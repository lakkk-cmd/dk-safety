/**
 * project_features 수정이 실제로 오탐을 해결했는지, 차단됐던 것과 동일한 질문/답변으로
 * validateAgentAnswer를 다시 돌려 확인한다. Usage:
 * npx tsx --env-file=.env.local scripts/verify-project-features-fix.mjs
 */
const { validateAgentAnswer } = await import("../src/lib/cross-validate.ts");

const question = "너의 역활이 어떤건지 나에게 정확히 풀어서 설명해줘";
const answer = `## 저 풀의 역할 — 정확히 설명드립니다 🎯

## 한 줄 요약
대장님 1인 사업을 9명 전문가 수준으로 보좌하는 AI 총괄 디렉터입니다.

## 실제로 하는 일 — 4가지

### 1️⃣ 현황 파악 + 보고
- 예약·매출·콘텐츠·파이프라인 실시간 조회
- 9명 전문 에이전트 호출 → 종합 분석 보고
- 시장 인텔리전스 수집 → 사업 기회 알림

### 2️⃣ 콘텐츠 생산
- 유튜브 영상 제작 등록 (create_video_job)
- 블로그 원고 제작 등록 (create_blog_job)
- 카카오·유튜브·블로그 초안 등록
→ 단, 발행은 반드시 대장님 승인 후

### 3️⃣ 코드·시스템 개선
- GitHub 이슈 등록 → Claude Code가 구현`;

const result = await validateAgentAnswer({
  question,
  answer,
  hasRAGEvidence: false,
  includeProjectContext: true,
});

console.log("passed:", result.passed);
console.log("score:", result.score);
console.log("hasDangerousMisinfo:", result.hasDangerousMisinfo);
console.log("hasFalseInfo:", result.hasFalseInfo);
console.log("warnings:", result.warnings);

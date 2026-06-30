/**
 * runFullMeeting() round1/round2 max_tokens 1024→4096 수정 검증
 * Usage: npx tsx --env-file=.env.local scripts/test-full-meeting.mjs
 */
const { runFullMeeting } = await import("../src/lib/agents.ts");

const result = await runFullMeeting(
  "이번달은 유튜브 · 카카오 · 블로그 콘텐츠를 현존최고의 품질과 퀄리티로 만드는데에 집중",
  "",
  "",
);

console.log("=== round1 ===");
for (const r of result.round1) console.log(`${r.agent.name}: 길이=${r.response.length}`);

console.log("\n=== round2 ===");
for (const r of result.round2) console.log(`${r.agent.name}: 길이=${r.response.length}`);

console.log("\n=== chiefSummary 길이 ===", result.chiefSummary.length);
console.log("\n완료");

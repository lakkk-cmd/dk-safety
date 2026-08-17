/**
 * loadRecentSignalsBrief() 실사용 검증 — 프로덕션 DB에서 실제로 조회가 되는지, 세 소스가
 * 각각 몇 건씩 잡히는지 확인한다. 읽기 전용, 사이드이펙트 없음.
 * Usage: npx tsx --env-file=.env.local scripts/test-recent-signals.mjs
 */
const { loadRecentSignalsBrief } = await import("../src/lib/recent-signals.ts");

const brief = await loadRecentSignalsBrief(7);

console.log("=== loadRecentSignalsBrief(7) ===");
console.log(brief || "(비어있음 — 최근 7일간 지식/시장인텔리전스/스캔 성장기회가 하나도 없음)");
console.log("\n=== 길이 ===", brief.length, "chars");

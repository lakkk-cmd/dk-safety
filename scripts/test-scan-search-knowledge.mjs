/**
 * 아침 스캔에 추가한 search_knowledge 도구가 실제로 지식베이스에서 결과를 가져오는지 검증.
 * scan-investigator.ts와 동일한 두 함수(searchKnowledgeBase + searchKnowledgeChunks)를 그대로 호출.
 * Usage: npx tsx --env-file=.env.local scripts/test-scan-search-knowledge.mjs
 */
const { searchKnowledgeBase } = await import("../src/lib/knowledge-base.ts");
const { searchKnowledgeChunks } = await import("../src/lib/knowledge-chunks-search.ts");

const query = process.argv[2] || "전기요금 절약 정부지원";

const [kb, chunks] = await Promise.all([
  searchKnowledgeBase(query, 5),
  searchKnowledgeChunks(query, 5).catch((e) => `(오류: ${e.message})`),
]);

console.log(`=== query: "${query}" ===\n`);
console.log("--- searchKnowledgeBase (OpenRouter) ---");
console.log(kb || "(결과 없음)");
console.log("\n--- searchKnowledgeChunks (Voyage) ---");
console.log(chunks || "(결과 없음)");

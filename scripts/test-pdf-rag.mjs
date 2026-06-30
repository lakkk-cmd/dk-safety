/** Anthropic API 한도와 무관하게 RAG 검색(OpenRouter 임베딩) 자체가 PDF 청크를 찾아내는지 직접 검증 */
const { searchKnowledgeBase } = await import("../src/lib/knowledge-base.ts");

const result = await searchKnowledgeBase("분전반 점검 보증 기간 코드명이 뭐야?");
console.log("=== searchKnowledgeBase 결과 ===");
console.log(result || "(빈 결과 — 매칭 없음)");

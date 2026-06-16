/**
 * RAG 에이전트 테스트 — 적용 전/후 비교
 * 1. searchKnowledgeBase 검색 결과 출력 (RAG 작동 확인)
 * 2. 3개 에이전트에게 실제 질문 → 응답 확인
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-rag-agents.ts
 */

import { searchKnowledgeBase } from "@/lib/knowledge-base";
import { chatWithAgentPlus } from "@/lib/agent-chat";

const TESTS = [
  { agentId: "clo", question: "Track B 구조 설명해줘", expectKeywords: ["Track B", "시공업체", "중개", "법적"] },
  { agentId: "cso", question: "3년 로드맵 1년차 목표가 뭐야?", expectKeywords: ["5,000만원", "1년차", "카카오"] },
  { agentId: "cto", question: "특허 4개 모듈이 뭐야?", expectKeywords: ["110", "120", "130", "140", "모듈"] },
];

function sep(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

async function main() {
  console.log("🔍 RAG 에이전트 테스트");
  console.log(`시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

  // ─── Step 1: RAG 검색 결과 사전 검증 ─────────────────────────────────────────
  sep("STEP 1: 검색 쿼리별 RAG 검색 결과 확인");
  for (const t of TESTS) {
    console.log(`\n[${t.agentId}] 쿼리: "${t.question}"`);
    const result = await searchKnowledgeBase(t.question);
    if (!result) {
      console.log("  ❌ RAG 검색 결과 없음 — 지식베이스 확인 필요");
    } else {
      const lines = result.split("\n");
      console.log(`  ✅ RAG 검색 결과 (${lines.length}줄):`);
      lines.slice(0, 6).forEach((l) => console.log(`     ${l}`));
      if (lines.length > 6) console.log(`     ... (${lines.length - 6}줄 더)`);
    }
  }

  // ─── Step 2: 에이전트 실제 응답 테스트 ────────────────────────────────────────
  sep("STEP 2: 에이전트 실제 응답 (RAG 주입 포함)");
  const results: { agentId: string; question: string; reply: string; passed: boolean }[] = [];

  for (const t of TESTS) {
    console.log(`\n[${t.agentId}] 질문: "${t.question}"`);
    console.log("  Claude 호출 중...");
    try {
      const reply = await chatWithAgentPlus(t.agentId, t.question);
      const passed = t.expectKeywords.some((kw) => reply.includes(kw));
      results.push({ agentId: t.agentId, question: t.question, reply, passed });
      console.log(`  응답:\n${reply.split("\n").map(l => `    ${l}`).join("\n")}`);
      console.log(`\n  키워드 체크 (${t.expectKeywords.join(", ")}): ${passed ? "✅ 통과" : "⚠️ 키워드 미포함"}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ agentId: t.agentId, question: t.question, reply: `ERROR: ${msg}`, passed: false });
      console.error(`  ❌ 오류: ${msg}`);
    }
  }

  // ─── 최종 요약 ────────────────────────────────────────────────────────────────
  sep("테스트 결과 요약");
  let passed = 0;
  for (const r of results) {
    const icon = r.passed ? "✅" : "⚠️";
    console.log(`${icon} [${r.agentId}] "${r.question.slice(0, 30)}"`);
    if (!r.passed) console.log(`   답변 일부: ${r.reply.slice(0, 100)}...`);
    if (r.passed) passed++;
  }
  console.log(`\n전체: ${passed}/${results.length} 통과`);
  console.log(`종료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

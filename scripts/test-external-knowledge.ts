/**
 * 외부 지식 수집 파이프라인 테스트
 *
 * 1. 7개 카테고리 수집 실행 → 삽입 결과 출력
 * 2. knowledge_base 행 수 확인
 * 3. CLO: "최근 전기안전관리법 바뀐 거 있어?" → RAG 답변 출력
 * 4. CSO: "요즘 비슷한 업체들 가격대 어때?" → RAG 답변 출력
 *
 * Usage: npx tsx --env-file=.env.local scripts/test-external-knowledge.ts
 */

import { createClient } from "@supabase/supabase-js";
import { runExternalKnowledgeCollection } from "@/lib/external-knowledge";
import { chatWithAgent } from "@/lib/agent-chat";

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, ""),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

function sep(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function main() {
  console.log("🌐 외부 지식 수집 파이프라인 테스트");
  console.log(`시작: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

  // ─── Step 1: 수집 실행 ──────────────────────────────────────────────────────
  sep("STEP 1: 7개 카테고리 외부 지식 수집");
  const results = await runExternalKnowledgeCollection();

  let totalInserted = 0;
  for (const r of results) {
    const icon = r.error ? "❌" : "✅";
    console.log(`${icon} [${r.category}] 삽입 ${r.inserted}, 삭제 ${r.deleted}${r.error ? " — " + r.error : ""}`);
    totalInserted += r.inserted;
  }
  console.log(`\n총 삽입: ${totalInserted} / 7개 카테고리`);

  // ─── Step 2: DB 행 수 확인 ──────────────────────────────────────────────────
  sep("STEP 2: knowledge_base 외부 항목 확인");
  const { data: rows } = await supabase
    .from("knowledge_base")
    .select("id, category, title, is_external, expires_at, created_at")
    .eq("is_external", true)
    .order("created_at", { ascending: false })
    .limit(14);

  if (rows && rows.length > 0) {
    for (const r of rows) {
      const expiry = r.expires_at ? new Date(r.expires_at).toLocaleDateString("ko-KR") : "영구";
      console.log(`  [${r.category}] ${r.title.slice(0, 50)} (만료: ${expiry})`);
    }
    console.log(`\n총 외부 항목: ${rows.length}건`);
  } else {
    console.log("외부 항목 없음");
  }

  // ─── Step 3: CLO 채팅 테스트 ────────────────────────────────────────────────
  sep("STEP 3: CLO — 전기안전관리법 변경 질문 (RAG 검증)");
  const cloQuestion = "최근 전기안전관리법 바뀐 거 있어? 우리 사업에 영향 있는 거 있으면 알려줘.";
  console.log(`질문: "${cloQuestion}"`);
  console.log("Claude API 호출 중...");
  const cloReply = await chatWithAgent("clo", cloQuestion);
  console.log("\n▶ CLO 답변:");
  console.log(cloReply.split("\n").map((l: string) => `  ${l}`).join("\n"));

  // ─── Step 4: CSO 채팅 테스트 ────────────────────────────────────────────────
  sep("STEP 4: CSO — 경쟁사 가격 질문 (RAG 검증)");
  const csoQuestion = "요즘 비슷한 업체들 가격대 어때? 우리 전기점검 서비스 가격이 경쟁력 있는 편이야?";
  console.log(`질문: "${csoQuestion}"`);
  console.log("Claude API 호출 중...");
  const csoReply = await chatWithAgent("cso", csoQuestion);
  console.log("\n▶ CSO 답변:");
  console.log(csoReply.split("\n").map((l: string) => `  ${l}`).join("\n"));

  console.log(`\n종료: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Full 에이전트 시나리오2: 콘텐츠 기획 등록 테스트
 * Usage: npx tsx --env-file=.env.local scripts/test-full-agent-2.mjs
 */
const { chatWithFullAgent } = await import("../src/lib/full-agent.ts");
const { createClient } = await import("@supabase/supabase-js");

const result = await chatWithFullAgent("분전반 점검법 영상 기획해서 승인 큐에 올려줘");

console.log("--- 도구 호출 내역 ---");
for (const c of result.toolCalls) console.log(`  - ${c.name}(${JSON.stringify(c.input).slice(0, 200)})`);
console.log("\n--- 최종 답변 ---");
console.log(result.reply);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase
  .from("content_youtube_queue")
  .select("id, title, competitor_notes, category, status, created_at")
  .order("created_at", { ascending: false })
  .limit(1);

console.log("\n--- content_youtube_queue 최신 행 (DB 직접 조회) ---");
console.log("error:", error?.message ?? null);
console.log(JSON.stringify(data, null, 2));

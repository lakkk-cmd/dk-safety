/**
 * 총괄디렉터 답변이 "거짓/위험 정보 감지"로 차단된 사례를 agent_logs(source='cross_validator')
 * 에서 조회해 원본 답변 + Gemini 판정 사유를 확인한다. 읽기 전용.
 * Usage: npx tsx --env-file=.env.local scripts/inspect-blocked-answer.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("agent_logs")
  .select("created_at, level, source, message, meta")
  .eq("source", "cross_validator")
  .order("created_at", { ascending: false })
  .limit(15);

if (error) {
  console.error("조회 실패:", error);
  process.exit(1);
}

for (const row of data ?? []) {
  const meta = row.meta ?? {};
  if (meta.type !== "agent_answer") continue;
  console.log("=".repeat(80));
  console.log("시각:", row.created_at, "| level:", row.level, "| passed:", meta.passed, "| score:", meta.score);
  console.log("질문(target):", meta.target);
  console.log("--- 원본 답변(original) ---");
  console.log(meta.original);
  console.log("--- Gemini 판정(verdict) ---");
  console.log(meta.verdict);
  console.log("hasDangerousMisinfo:", meta.hasDangerousMisinfo, "| hasFalseInfo:", meta.hasFalseInfo, "| hasRAGEvidence:", meta.hasRAGEvidence);
}

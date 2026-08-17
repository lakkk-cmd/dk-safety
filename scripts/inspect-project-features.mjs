/**
 * project_features 테이블에서 이번 오탐(false positive) 차단의 원인이 된 낡은 항목을 찾는다.
 * 읽기 전용.
 * Usage: npx tsx --env-file=.env.local scripts/inspect-project-features.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("project_features")
  .select("category, name, description, status, path, updated_at")
  .or("name.ilike.%영상%,name.ilike.%에이전트%,description.ilike.%영상%,description.ilike.%에이전트%,description.ilike.%6에이전트%")
  .order("category")
  .order("status");

if (error) {
  console.error("조회 실패:", error);
  process.exit(1);
}

for (const row of data ?? []) {
  console.log("-".repeat(70));
  console.log(`[${row.category}/${row.status}] ${row.name}`);
  console.log(row.description);
  console.log("path:", row.path, "| updated_at:", row.updated_at);
}
console.log("\n총", (data ?? []).length, "건");

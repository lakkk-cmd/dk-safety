/**
 * system-health.ts에 추가한 project_features 노후화 감지가 실제로 작동하는지 확인.
 * runWeeklySystemCheck() 전체를 돌리면 실제 system_health_reports에 기록이 남고 카카오
 * 알림 트리거 로직과 얽히므로, 여기서는 감지 로직만 별도로 검증하기 위해 동일 쿼리를 재현한다.
 * Usage: npx tsx --env-file=.env.local scripts/test-stale-features-check.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

const { data, error } = await supabase
  .from("project_features")
  .select("name, category, updated_at")
  .in("category", ["feature", "pending", "integration"])
  .lt("updated_at", cutoff)
  .order("updated_at", { ascending: true });

if (error) throw error;

console.log(`30일 이상 미갱신된 항목: ${data.length}건\n`);
for (const row of data) {
  console.log(`- [${row.category}] ${row.name} (마지막 갱신 ${row.updated_at.slice(0, 10)})`);
}

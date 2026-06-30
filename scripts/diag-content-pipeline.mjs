import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function section(title) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

section("1) content_youtube_queue — 최근 10건");
{
  const { data, error } = await supabase
    .from("content_youtube_queue")
    .select("id, title, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음)");
  else for (const r of data) console.log(`[${r.status}] ${r.created_at} → ${r.updated_at}  ${r.title}`);
}

section("2) content_kakao_queue — 최근 10건");
{
  const { data, error } = await supabase
    .from("content_kakao_queue")
    .select("id, title, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음)");
  else for (const r of data) console.log(`[${r.status}] ${r.created_at} → ${r.updated_at}  ${r.title}`);
}

section("3) blog_posts — 최근 10건");
{
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, title, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음)");
  else for (const r of data) console.log(`[${r.status}] ${r.created_at} → ${r.updated_at}  ${r.title}`);
}

section("4) pipeline_logs — 최근 30건 (content-plan/content-draft/content-approval-notify/content-performance-review/morning-report)");
{
  const { data, error } = await supabase
    .from("pipeline_logs")
    .select("id, pipeline, status, started_at, finished_at, detail")
    .order("started_at", { ascending: false })
    .limit(30);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음 — 크론이 한 번도 안 돌았거나 로그 테이블 미사용)");
  else for (const r of data) {
    console.log(`[${r.status}] ${r.pipeline}  시작:${r.started_at}  종료:${r.finished_at ?? "-"}`);
    if (r.detail && Object.keys(r.detail).length) console.log(`   ↳ detail: ${JSON.stringify(r.detail).slice(0, 200)}`);
  }
}

section("5) agent_logs — 최근 30건");
{
  const { data, error } = await supabase
    .from("agent_logs")
    .select("id, level, source, message, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음)");
  else for (const r of data) console.log(`${r.created_at}  [${r.level}/${r.source}] ${r.message?.slice(0, 150) ?? ""}`);
}

section("6) boss_feedback — OCR 실패 알림 포함 최근 15건");
{
  const { data, error } = await supabase
    .from("boss_feedback")
    .select("id, content, status, created_at")
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음)");
  else for (const r of data) console.log(`${r.created_at} [${r.status}] ${r.content?.slice(0, 150)}`);
}

section("7) agent_memory — content_performance_lessons / 콘텐츠 기억");
{
  const { data, error } = await supabase
    .from("agent_memory")
    .select("key, content, updated_at")
    .order("updated_at", { ascending: false })
    .limit(15);
  if (error) console.error("ERROR:", error.message);
  else if (!data?.length) console.log("(데이터 없음)");
  else for (const r of data) console.log(`${r.updated_at}  key=${r.key}  content=${r.content?.slice(0, 80)}`);
}

console.log("\n완료");

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase
  .from("content_youtube_queue")
  .select("id, title, status, script, conti_summary, scenes")
  .not("script", "is", null)
  .order("created_at", { ascending: false })
  .limit(5);

if (error) { console.error(error.message); process.exitCode = 1; }
else {
  for (const item of data ?? []) {
    console.log(`\n[${item.status}] ${item.id}`);
    console.log(`제목: ${item.title}`);
    console.log(`스크립트: ${item.script ? item.script.slice(0, 80) + "..." : "없음"}`);
    console.log(`콘티: ${item.conti_summary ? item.conti_summary.slice(0, 60) + "..." : "없음"}`);
    console.log(`씬 수: ${Array.isArray(item.scenes) ? item.scenes.length : 0}`);
  }
}

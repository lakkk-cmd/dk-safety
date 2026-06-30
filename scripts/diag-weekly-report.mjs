import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase
  .from("agent_reports")
  .select("id, created_at, date_label, chief_summary, sections, approved")
  .order("created_at", { ascending: false })
  .limit(4);

if (error) {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
} else {
  for (const r of data ?? []) {
    console.log(`\n${"=".repeat(70)}\n[${r.date_label}] ${r.created_at} (approved=${r.approved})\n${"=".repeat(70)}`);
    console.log("chief_summary 길이:", r.chief_summary?.length ?? 0);
    const sections = Array.isArray(r.sections) ? r.sections : [];
    console.log(`sections(topics) 개수: ${sections.length}`);
    for (const topicSection of sections) {
      console.log(`\n--- 주제: ${topicSection.topic} ---`);
      for (const [roundName, roundArr] of [["round1", topicSection.round1], ["round2", topicSection.round2]]) {
        console.log(`  [${roundName}]`);
        for (const a of roundArr ?? []) {
          console.log(`    ${a.agent_name} (${a.agent_id}): 길이=${a.response?.length ?? 0}`);
        }
      }
    }
  }
}

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
const rows = await sql`
  SELECT id, title, status, category, created_at
  FROM content_youtube_queue
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log("=== content_youtube_queue 최근 10개 ===");
for (const r of rows) {
  console.log(`[${r.status}] ${r.id} | ${r.title?.slice(0, 40)} | ${r.category} | ${r.created_at}`);
}
await sql.end({ timeout: 5 });

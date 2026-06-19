import postgres from "postgres";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL이 없습니다. .env.local에 DATABASE_URL을 설정하세요.");
  process.exitCode = 1;
} else {
  const sql = postgres(connectionString, { max: 1, ssl: "require" });
  try {
    await sql.unsafe(`ALTER TABLE public.content_youtube_queue ADD COLUMN IF NOT EXISTS conti_summary TEXT DEFAULT NULL;`);
    await sql.unsafe(`COMMENT ON COLUMN public.content_youtube_queue.conti_summary IS '전체 영상 콘티 요약: 감정곡선 + 5가지 영화적 장치 적용 방법 (planVideoScenes 출력)';`);
    console.log("✓ migration 039 applied: conti_summary column added");
  } catch (e) {
    console.error("Migration failed:", e.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

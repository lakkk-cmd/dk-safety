import fs from "node:fs";
import path from "node:path";
import { assert, check, finish } from "./_util";

const root = process.cwd();

const migrationsDir = path.join(root, "supabase/migrations");
const migration025Files = fs.readdirSync(migrationsDir).filter((f) => f.startsWith("025_") && f.endsWith(".sql"));

check("supabase/migrations/025_*.sql exists", () => {
  assert.equal(migration025Files.length, 1, `expected exactly one 025_*.sql file, found ${migration025Files.length}`);
});

if (migration025Files.length > 0) {
  const sql = fs.readFileSync(path.join(migrationsDir, migration025Files[0]), "utf-8");

  const tables = ["youtube_channels", "youtube_videos", "youtube_insights", "agent_logs", "pipeline_logs"];
  for (const table of tables) {
    check(`025 migration creates table ${table}`, () => {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`));
    });
  }

  check("025 migration adds agent_reports.approved / approved_at columns", () => {
    assert.match(sql, /ALTER TABLE public\.agent_reports/);
    assert.match(sql, /approved BOOLEAN/);
    assert.match(sql, /approved_at TIMESTAMPTZ/);
  });
}

const migration026Files = fs.readdirSync(migrationsDir).filter((f) => f.startsWith("026_") && f.endsWith(".sql"));

check("supabase/migrations/026_*.sql exists", () => {
  assert.equal(migration026Files.length, 1, `expected exactly one 026_*.sql file, found ${migration026Files.length}`);
});

if (migration026Files.length > 0) {
  const sql = fs.readFileSync(path.join(migrationsDir, migration026Files[0]), "utf-8");

  const tables = ["blog_posts", "naver_trends", "content_youtube_queue", "content_kakao_queue", "youtube_oauth_tokens"];
  for (const table of tables) {
    check(`026 migration creates table ${table}`, () => {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`));
    });
  }
}

const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf-8");
for (const key of [
  "GEMINI_API_KEY",
  "YOUTUBE_API_KEY",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "KAKAO_ACCESS_TOKEN",
]) {
  check(`.env.example declares ${key}`, () => {
    assert.match(envExample, new RegExp(`^${key}=`, "m"));
  });
}

finish();

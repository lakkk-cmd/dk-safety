import postgres from "postgres";
import { readFileSync } from "fs";
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
const migration = readFileSync("supabase/migrations/038_veo_async.sql", "utf8");
await sql.unsafe(migration);
console.log("✓ 038_veo_async.sql 적용 완료");
await sql.end({ timeout: 5 });

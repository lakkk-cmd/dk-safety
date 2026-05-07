/**
 * 전체 db:apply가 중간에 실패할 때 특정 SQL 파일만 적용합니다.
 * 사용: node --env-file=.env.local scripts/apply-single-migration.mjs supabase/migrations/018_pricing_catalog.sql
 */
import fs from "fs";
import path from "path";
import url from "url";
import postgres from "postgres";

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const rel = process.argv[2];
if (!rel) {
  console.error("인수로 마이그레이션 파일 경로를 주세요. 예: supabase/migrations/018_pricing_catalog.sql");
  process.exit(1);
}
const migrationPath = path.isAbsolute(rel) ? rel : path.join(root, rel);
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL이 비어 있습니다.");
  process.exit(1);
}

const sqlConn = postgres(connectionString, { max: 1, ssl: "require" });
try {
  const sql = fs.readFileSync(migrationPath, "utf8");
  await sqlConn.unsafe(sql);
  console.log("적용 완료:", migrationPath);
} catch (error) {
  console.error("적용 실패:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sqlConn.end({ timeout: 5 });
}

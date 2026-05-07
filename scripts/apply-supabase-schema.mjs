import fs from "fs";
import path from "path";
import url from "url";
import postgres from "postgres";

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "DATABASE_URL이 비어 있습니다.\n" +
      "Supabase Dashboard → Project Settings → Database → Connection string 에서\n" +
      "URI(예: postgresql://postgres.[ref]:비밀번호@...pooler.supabase.com:6543/postgres)를 복사해 .env.local에 DATABASE_URL= 로 넣은 뒤 다시 실행하세요."
  );
  process.exit(1);
}

const sqlConn = postgres(connectionString, { max: 1, ssl: "require" });
try {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  for (const fileName of files) {
    const migrationPath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(migrationPath, "utf8");
    await sqlConn.unsafe(sql);
    console.log("스키마 적용:", migrationPath);
  }
  console.log("스키마 적용 완료");
  console.log("다음: npm run db:sync-env  (DK_SAFETY_USE_SUPABASE_DB=true 반영)");
} catch (error) {
  console.error("스키마 적용 실패:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sqlConn.end({ timeout: 5 });
}

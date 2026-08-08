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
  // 이미 적용된 파일은 다시 재생하지 않는다 — 과거엔 매번 001번부터 전체를 재생해서,
  // 운영 데이터가 이미 앞서간 상태(예: 나중 마이그레이션에서만 허용되는 값)로는
  // 중간 단계의 옛 제약과 충돌해 재생 자체가 막히는 문제가 있었다.
  await sqlConn.unsafe(
    `create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );`
  );
  const appliedRows = await sqlConn`select filename from public.schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  for (const fileName of files) {
    if (applied.has(fileName)) {
      console.log("이미 적용됨(skip):", fileName);
      continue;
    }
    const migrationPath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(migrationPath, "utf8");
    await sqlConn.begin(async (tx) => {
      await tx.unsafe(sql);
      await tx`insert into public.schema_migrations (filename) values (${fileName})`;
    });
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

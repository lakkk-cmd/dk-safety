/**
 * .env.local 에서 Supabase URL/키가 모두 채워져 있으면 DK_SAFETY_USE_SUPABASE_DB=true,
 * WORKER_SESSION_SECRET 이 비어 있으면 임의 값을 채웁니다.
 */
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(".env.local 파일이 없습니다.");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const lines = raw.split(/\r?\n/);
const getValue = (key) => {
  const prefix = `${key}=`;
  const line = lines.find((l) => l.startsWith(prefix));
  if (!line) return "";
  return line.slice(prefix.length).trim();
};

const url = getValue("NEXT_PUBLIC_SUPABASE_URL");
const key = getValue("SUPABASE_SERVICE_ROLE_KEY");
const dbUrl = getValue("DATABASE_URL");
// 마이그레이션(npm run db:apply)을 하려면 DATABASE_URL 이 필요하므로, 없으면 DB 모드는 끕니다.
const dk = url.length > 0 && key.length > 0 && dbUrl.length > 0 ? "true" : "false";

let worker = getValue("WORKER_SESSION_SECRET");
if (!worker) {
  worker = randomBytes(32).toString("hex");
}

const marker = "# --- sync-db-env.mjs 가 유지합니다 ---";
const dropKeys = new Set(["DK_SAFETY_USE_SUPABASE_DB", "WORKER_SESSION_SECRET"]);
const next = lines.filter((l) => {
  if (l.trim() === marker) return false;
  const m = l.match(/^([A-Za-z0-9_]+)=/);
  if (!m) return true;
  return !dropKeys.has(m[1]);
});

while (next.length && next[next.length - 1] === "") {
  next.pop();
}

next.push("");
next.push(marker);
next.push(`DK_SAFETY_USE_SUPABASE_DB=${dk}`);
next.push(`WORKER_SESSION_SECRET=${worker}`);

fs.writeFileSync(envPath, next.join("\n") + "\n", "utf-8");
console.log(`Wrote .env.local: DK_SAFETY_USE_SUPABASE_DB=${dk}`);
if (dk === "false" && url.length > 0 && key.length > 0 && dbUrl.length === 0) {
  console.log("힌트: DATABASE_URL 을 채운 뒤 npm run db:apply → 다시 npm run db:sync-env 하면 DB 모드가 켜집니다.");
}
if (!getValue("WORKER_SESSION_SECRET")) {
  console.log("WORKER_SESSION_SECRET was empty; generated a new secret.");
}

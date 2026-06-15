/**
 * 시장 정보 수집 에이전트(/api/cron/market-intelligence) 수동 테스트.
 * 기본은 로컬 dev 서버. 배포 후에는 CRON_TEST_BASE_URL=https://dkansim.com 로 실행.
 *
 * Usage: node --env-file=.env.local scripts/test-market-intelligence.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_BASE = "http://localhost:3000";
const base = (process.env.CRON_TEST_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");

function loadCronSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET.trim();
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    throw new Error("CRON_SECRET 없음. .env.local에 CRON_SECRET=... 추가하거나 --env-file=.env.local 사용");
  }
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("CRON_SECRET="));
  if (!line) throw new Error(".env.local에 CRON_SECRET=... 가 없습니다.");
  const value = line.slice("CRON_SECRET=".length).trim();
  if (!value || value.length < 32) {
    throw new Error("CRON_SECRET 값이 비어 있거나 너무 짧습니다.");
  }
  return value;
}

const secret = loadCronSecret();
const url = `${base}/api/cron/market-intelligence`;

if (/\.vercel\.app$/i.test(new URL(url).hostname)) {
  console.warn(
    "[warn] *.vercel.app URL은 Vercel Deployment Protection 때문에 401/HTML이 나올 수 있습니다.",
  );
  console.warn(`       프로덕션 테스트는 CRON_TEST_BASE_URL=https://dkansim.com 을 사용하세요.`);
}

console.log(`GET ${url}`);

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
});

const text = await res.text();
let body = text;
try {
  body = JSON.stringify(JSON.parse(text), null, 2);
} catch {
  /* keep raw */
}

if (!res.ok) {
  console.error(`HTTP ${res.status}\n${body.slice(0, 2000)}`);
  process.exit(1);
}

console.log(`HTTP ${res.status}\n${body}`);

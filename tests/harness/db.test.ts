import fs from "node:fs";
import path from "node:path";
import { assert, check, finish } from "./_util";
import { countSalesPlanReservations } from "@/lib/sales-plan-summary";
import type { Reservation } from "@/lib/reservations-store";

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

const migration027Files = fs.readdirSync(migrationsDir).filter((f) => f.startsWith("027_") && f.endsWith(".sql"));

check("supabase/migrations/027_*.sql exists", () => {
  assert.equal(migration027Files.length, 1, `expected exactly one 027_*.sql file, found ${migration027Files.length}`);
});

if (migration027Files.length > 0) {
  const sql = fs.readFileSync(path.join(migrationsDir, migration027Files[0]), "utf-8");

  check("027 migration creates table improvement_requests", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.improvement_requests\b/);
  });
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
  "GITHUB_TOKEN",
]) {
  check(`.env.example declares ${key}`, () => {
    assert.match(envExample, new RegExp(`^${key}=`, "m"));
  });
}

function fixtureReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: "r1",
    name: "테스트",
    phone: "010-0000-0000",
    address: "광주",
    serviceType: "점검",
    preferredDate: "2026-09-01",
    preferredTime: "10:00",
    detail: "",
    imageUrls: [],
    priority: "normal",
    status: "완료",
    note: "",
    noteUpdatedAt: null,
    baseFee: 0,
    extraFee: 0,
    totalAmount: 0,
    isPaid: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

// KST 월 경계 — createdAt(ISO 인스턴트)을 KST 기준으로 잘라야 한다(.omc/plans/hq-sales-plan-dashboard-2026-09.md
// Critic 검토에서 지적된 9시간 오프셋 버그 회귀 방지).
check("countSalesPlanReservations: KST 8/31 23:59:59는 8월로 집계된다(9월 monthCount에서 제외)", () => {
  const now = new Date("2026-09-15T00:00:00.000Z"); // KST 9월 15일 09:00 — "이번달" = 9월
  const reservations = [fixtureReservation({ id: "r-aug", createdAt: "2026-08-31T14:59:59.000Z" })];
  const { monthCount, campaignCount } = countSalesPlanReservations(reservations, now);
  assert.equal(monthCount, 0, "8/31 23:59:59 KST 예약은 9월 monthCount에 잡히면 안 된다");
  assert.equal(campaignCount, 0, "캠페인 기간(9/1~) 밖이므로 campaignCount에도 잡히면 안 된다");
});

check("countSalesPlanReservations: KST 9/1 00:00:00는 9월로 집계된다", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  const reservations = [fixtureReservation({ id: "r-sep", createdAt: "2026-08-31T15:00:00.000Z" })];
  const { monthCount, campaignCount } = countSalesPlanReservations(reservations, now);
  assert.equal(monthCount, 1, "9/1 00:00:00 KST 예약은 9월 monthCount에 잡혀야 한다");
  assert.equal(campaignCount, 1, "캠페인 기간(9/1~11/30) 안이므로 campaignCount에도 잡혀야 한다");
});

check("countSalesPlanReservations: 취소건/A·S재예약은 제외된다", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  const reservations = [
    fixtureReservation({ id: "r-cancel", status: "취소", createdAt: "2026-09-05T00:00:00.000Z" }),
    fixtureReservation({ id: "r-as", asSourceReservationId: "r-original", createdAt: "2026-09-05T00:00:00.000Z" }),
    fixtureReservation({ id: "r-ok", createdAt: "2026-09-05T00:00:00.000Z" }),
  ];
  const { monthCount } = countSalesPlanReservations(reservations, now);
  assert.equal(monthCount, 1, "취소건과 A/S 재예약을 제외하면 1건만 남아야 한다");
});

finish();

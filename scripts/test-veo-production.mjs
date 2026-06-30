/**
 * Veo 프로덕션 E2E 테스트
 * 1. DB에서 첫 번째 planning 항목에 스크립트 추가 + approved 상태로 변경
 * 2. 프로덕션 API /api/admin/content/video-production 호출 (admin 쿠키 포함)
 * 3. 결과(씬 목록 + 비용 로그) 확인
 *
 * 실행: node --env-file=.env.local scripts/test-veo-production.mjs
 */

import postgres from "postgres";

const QUEUE_ID = "03aec903-59a5-499c-8c40-012b7a319701"; // 메가옴 측정기
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const APP_URL = "https://dkansim.com"; // 프로덕션 엔드포인트

const TEST_SCRIPT = `안녕하세요, 대경이엔피 전기주치의입니다.
오늘은 메가옴 측정기, 즉 절연저항계 실전 사용법을 알려드리겠습니다.
아파트 분전함 옆 콘센트나 배선 상태를 점검할 때 꼭 필요한 장비입니다.
먼저 측정기 전원을 켜고 500V 레인지를 선택합니다.
검은 리드선은 접지단자에, 빨간 리드선은 점검할 전선에 연결합니다.
측정값이 1메가옴 이상이면 정상, 그 이하면 절연 불량입니다.
절연 불량이 발견되면 즉시 전기를 차단하고 전문가에게 점검을 받으세요.
점검이 필요하시면 dkansim.com에서 예약해 주세요.`;

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });

// Step 1: DB 항목 업데이트
console.log("▶ Step 1: DB 항목 approved 상태로 업데이트...");
await sql`
  UPDATE content_youtube_queue
  SET status = 'approved', script = ${TEST_SCRIPT}
  WHERE id = ${QUEUE_ID}
`;
const [row] = await sql`SELECT id, title, status FROM content_youtube_queue WHERE id = ${QUEUE_ID}`;
console.log(`✓ [${row.status}] ${row.title}`);
await sql.end({ timeout: 5 });

// Step 2: 관리자 로그인 → 쿠키 획득
console.log("\n▶ Step 2: 프로덕션 admin 로그인...");
const loginRes = await fetch(`${APP_URL}/api/admin/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
  redirect: "manual",
});
const setCookie = loginRes.headers.get("set-cookie") ?? "";
const authCookie = setCookie.match(/dk_admin_auth=[^;]+/)?.[0];
if (!authCookie) {
  console.error("❌ 로그인 실패. set-cookie:", setCookie);
  process.exit(1);
}
console.log(`✓ 쿠키 획득: ${authCookie.slice(0, 30)}...`);

// Step 3: 영상 제작 API 호출 (Veo 활성화, 최대 10분)
console.log("\n▶ Step 3: /api/admin/content/video-production 호출 (Veo, ~10분 소요)...");
console.log(`   대상: ${QUEUE_ID}`);
const t0 = Date.now();

const prodRes = await fetch(`${APP_URL}/api/admin/content/video-production`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: authCookie,
  },
  body: JSON.stringify({ queueId: QUEUE_ID }),
  signal: AbortSignal.timeout(700_000), // 11분 대기
});

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const prodBody = await prodRes.text();
console.log(`\n응답 ${prodRes.status} (${elapsed}초):`);

let parsed;
try { parsed = JSON.parse(prodBody); } catch { console.log(prodBody.slice(0, 500)); process.exit(1); }

if (!prodRes.ok) {
  console.error("❌ 영상 제작 실패:", JSON.stringify(parsed, null, 2).slice(0, 600));
  process.exit(1);
}

console.log("\n✅ 영상 제작 완료!");
console.log(`   씬 수     : ${parsed.scenes?.length ?? "?"}개`);
parsed.scenes?.forEach((s, i) => {
  console.log(`   [씬 ${i + 1}] type=${s.sceneType}`);
  if (s.videoUrl) console.log(`          videoUrl=${s.videoUrl.slice(0, 80)}...`);
  if (s.imageUrl) console.log(`          imageUrl=${s.imageUrl.slice(0, 80)}...`);
});

// Step 4: gemini_usage_log 확인
console.log("\n▶ Step 4: 비용 로그 확인...");
const sql2 = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });
const logs = await sql2`
  SELECT model, operation, scene_index, cost_usd, success, created_at
  FROM gemini_usage_log
  WHERE queue_id = ${QUEUE_ID}
  ORDER BY created_at
`;
let totalCost = 0;
for (const l of logs) {
  console.log(`  [씬 ${l.scene_index}] ${l.model} | ${l.operation} | $${l.cost_usd} | success=${l.success}`);
  totalCost += parseFloat(l.cost_usd);
}
console.log(`\n  총 Veo 비용: $${totalCost.toFixed(2)}`);
await sql2.end({ timeout: 5 });

console.log("\n" + "=".repeat(60));
console.log("✅ Veo 프로덕션 E2E 테스트 완료");
console.log("=".repeat(60));

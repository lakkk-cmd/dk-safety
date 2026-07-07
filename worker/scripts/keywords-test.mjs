/**
 * naver-keywords 단위 테스트 (mock 모드) — API 키 없이 실행 가능.
 * Usage: node worker/scripts/keywords-test.mjs
 */
import assert from "node:assert/strict";
import { getKeywordStats, parseVolume, isNaverAdConfigured } from "../lib/naver-keywords.mjs";

// mock 모드 강제 (키가 이미 설정된 PC에서도 이 테스트는 mock 경로를 검증)
delete process.env.NAVER_AD_API_KEY;
delete process.env.NAVER_AD_SECRET;
delete process.env.NAVER_AD_CUSTOMER_ID;

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("naver-keywords 단위 테스트 (mock 모드)");

await test("키 미설정 상태 인식", () => {
  assert.equal(isNaverAdConfigured(), false);
});

await test("parseVolume: 숫자/콤마 문자열/'< 10' 세 형태 모두 처리", () => {
  assert.equal(parseVolume(1234), 1234);
  assert.equal(parseVolume("1,234"), 1234);
  assert.equal(parseVolume("< 10"), 5);
  assert.equal(parseVolume(undefined), 0);
  assert.equal(parseVolume("abc"), 0);
});

const result = await getKeywordStats(["누전차단기", "콘센트 교체"]);

await test("mock 소스 표시", () => {
  assert.equal(result.source, "mock");
});

await test("연관 키워드 생성 (시드 2개 × 변형 6종 = 12개)", () => {
  assert.equal(result.keywords.length, 12);
});

await test("각 키워드 항목의 형태 (keyword/조회수/경쟁정도)", () => {
  for (const k of result.keywords) {
    assert.ok(typeof k.keyword === "string" && k.keyword.length > 0);
    assert.ok(Number.isFinite(k.monthlyPcVolume) && k.monthlyPcVolume >= 0);
    assert.ok(Number.isFinite(k.monthlyMobileVolume) && k.monthlyMobileVolume >= 100);
    assert.equal(k.monthlyTotal, k.monthlyPcVolume + k.monthlyMobileVolume);
    assert.ok(["낮음", "중간", "높음"].includes(k.competition));
  }
});

await test("결정적(deterministic) — 같은 시드는 항상 같은 결과", async () => {
  const again = await getKeywordStats(["누전차단기", "콘센트 교체"]);
  assert.deepEqual(again, result);
});

await test("빈 시드는 거부", async () => {
  await assert.rejects(() => getKeywordStats([]), /최소 1개/);
});

console.log(`\n${passed}개 테스트 전부 통과`);

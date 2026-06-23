const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const PHONE = "010-9999-0050";
const PIN = "1234";
const NORMAL_RESV_ID = process.argv[2];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 1100 } });

  await page.goto(`${BASE}/worker/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000); // let client component hydrate before filling controlled inputs
  const inputs = await page.$$("input");
  await inputs[0].fill(PHONE);
  await inputs[1].fill(PIN);
  await page.waitForTimeout(200);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/worker`, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector("text=점검 시작", { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: "scripts/p2-02-dashboard.png", fullPage: true });

  await page.goto(`${BASE}/field-report?reservationId=${NORMAL_RESV_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=분전반", { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/p2-03-step1.png", fullPage: true });

  await page.getByText("30A", { exact: true }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "scripts/p2-04-step2.png", fullPage: true });

  await page.getByRole("button", { name: "정상", exact: true }).first().click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "scripts/p2-05-step3.png", fullPage: true });

  await page.getByRole("button", { name: "정상", exact: true }).first().click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "scripts/p2-06-step4.png", fullPage: true });

  await page.getByRole("button", { name: /주의/ }).click();
  await page.screenshot({ path: "scripts/p2-07-step4-filled.png", fullPage: true });

  await page.getByRole("button", { name: /AI 리포트 자동 생성/ }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/p2-08-loading-overlay.png", fullPage: true });

  await page.waitForSelector("text=발송 완료", { timeout: 100000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/p2-09-final.png", fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

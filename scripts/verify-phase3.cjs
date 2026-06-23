const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const FIELD_REPORT_ID = process.argv[2];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 1400 } });

  await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/p3-01-home.png", fullPage: true });

  await page.goto(`${BASE}/apt/hills3`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/p3-02-apt.png", fullPage: true });

  await page.goto(`${BASE}/status`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const inputs = await page.$$("input");
  await inputs[0].fill("010-7777-8888");
  await page.getByRole("button", { name: "조회" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "scripts/p3-03-status.png", fullPage: true });

  await page.goto(`${BASE}/diagnosis/${FIELD_REPORT_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "scripts/p3-04-diagnosis.png", fullPage: true });

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  await desktop.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: "scripts/p3-05-home-desktop.png", fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

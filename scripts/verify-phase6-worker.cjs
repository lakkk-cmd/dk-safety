const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${BASE}/worker/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const inputs = await page.$$("input");
  await inputs[0].fill("010-9999-0070");
  await inputs[1].fill("5678");
  await page.getByRole("button", { name: /로그인/ }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scripts/p6-worker-dashboard.png", fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

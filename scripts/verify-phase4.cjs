const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const PAGES = process.argv.slice(2);

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "dk_admin_auth", value: "ok", url: BASE },
    { name: "dk_first_visit_checked", value: "1", url: BASE }
  ]);
  const page = await context.newPage();
  for (const p of PAGES) {
    const safeName = p.replaceAll("/", "_") || "root";
    await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `scripts/p4-${safeName}.png`, fullPage: true });
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

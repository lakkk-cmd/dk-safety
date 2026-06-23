const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch();

  const mobile = await browser.newPage({ viewport: { width: 375, height: 1400 } });
  await mobile.goto("http://localhost:3000/design-system", { waitUntil: "networkidle" });
  await mobile.screenshot({ path: "scripts/ds-mobile-375.png", fullPage: true });

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  await desktop.goto("http://localhost:3000/design-system", { waitUntil: "networkidle" });
  await desktop.screenshot({ path: "scripts/ds-desktop-1280.png", fullPage: true });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

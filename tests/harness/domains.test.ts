import fs from "node:fs";
import path from "node:path";
import { assert, check, finish } from "./_util";

const root = process.cwd();
const exists = (relPath: string) => fs.existsSync(path.join(root, relPath));

const requiredFiles = [
  "src/app/hq/layout.tsx",
  "src/app/hq/page.tsx",
  "src/app/hq/login/page.tsx",
  "src/app/report/layout.tsx",
  "src/app/report/page.tsx",
];

for (const file of requiredFiles) {
  check(`${file} exists`, () => {
    assert.ok(exists(file), `${file} not found`);
  });
}

const middleware = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf-8");
for (const prefix of ['"hq."', '"report."', '"agent."']) {
  check(`src/middleware.ts references ${prefix}`, () => {
    assert.ok(middleware.includes(prefix), `${prefix} not found in src/middleware.ts`);
  });
}

const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf-8")) as {
  crons?: Array<{ path: string }>;
};

for (const cron of vercelConfig.crons ?? []) {
  check(`vercel.json cron path ${cron.path} has a matching route.ts`, () => {
    const routeFile = path.join(root, "src/app", cron.path.replace(/^\//, ""), "route.ts");
    assert.ok(fs.existsSync(routeFile), `${routeFile} not found`);
  });
}

check("src/app/admin/command-center is removed", () => {
  assert.ok(!exists("src/app/admin/command-center"), "src/app/admin/command-center still exists");
});

const adminNav = fs.readFileSync(path.join(root, "src/lib/admin-nav.ts"), "utf-8");
check("src/lib/admin-nav.ts no longer references command-center", () => {
  assert.ok(!adminNav.includes("command-center"), "admin-nav.ts still references command-center");
});

finish();

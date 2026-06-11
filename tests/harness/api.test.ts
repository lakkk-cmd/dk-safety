import fs from "node:fs";
import path from "node:path";
import { assert, check, finish } from "./_util";

const root = process.cwd();
const apiRoot = path.join(root, "src/app/api");

function findRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

const routeFiles = findRouteFiles(apiRoot);

check("at least one API route.ts exists under src/app/api", () => {
  assert.ok(routeFiles.length > 0, "no route.ts files found");
});

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const maxDurationPattern = /export\s+const\s+maxDuration\s*=\s*(\d+)/;

for (const file of routeFiles) {
  const relPath = path.relative(root, file);
  const content = fs.readFileSync(file, "utf-8");

  check(`${relPath}: exports at least one HTTP method handler`, () => {
    const hasMethod = HTTP_METHODS.some(
      (method) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(content) ||
        new RegExp(`export\\s+const\\s+${method}\\b`).test(content) ||
        new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(content),
    );
    assert.ok(hasMethod, `no exported HTTP method handler (${HTTP_METHODS.join("/")}) found`);
  });

  const maxDurationMatch = content.match(maxDurationPattern);
  if (maxDurationMatch) {
    check(`${relPath}: maxDuration is within Vercel limit (1-300)`, () => {
      const value = Number(maxDurationMatch[1]);
      assert.ok(value >= 1 && value <= 300, `maxDuration=${value} is outside the 1-300 range`);
    });
  }
}

finish();

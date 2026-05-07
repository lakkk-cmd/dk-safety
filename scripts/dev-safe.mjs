import { rm } from "fs/promises";
import { existsSync } from "fs";
import { spawn, spawnSync } from "child_process";

const DEV_PORT = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execCapture(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function getListeningPidsOnWindows(port) {
  const result = execCapture("netstat", ["-ano", "-p", "tcp"]);
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pids = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(`:${port}`) || !line.includes("LISTENING")) continue;
    const match = line.trim().match(/LISTENING\s+(\d+)$/);
    if (match) pids.add(Number(match[1]));
  }
  return [...pids];
}

function getListeningPidsOnUnix(port) {
  const lsof = execCapture("lsof", ["-ti", `tcp:${port}`]);
  const pids = new Set();
  for (const line of (lsof.stdout ?? "").split(/\r?\n/)) {
    const pid = Number(line.trim());
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function killPid(pid) {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return;
  if (process.platform === "win32") {
    execCapture("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }
  execCapture("kill", ["-9", String(pid)]);
}

async function main() {
  const pids =
    process.platform === "win32" ? getListeningPidsOnWindows(DEV_PORT) : getListeningPidsOnUnix(DEV_PORT);

  if (pids.length > 0) {
    console.log(`[dev-safe] Closing processes on port ${DEV_PORT}: ${pids.join(", ")}`);
    for (const pid of pids) killPid(pid);
    // Windows: handles on .next / locks release slowly — too short causes ENOENT app-build-manifest / _buildManifest.tmp during next dev.
    await sleep(process.platform === "win32" ? 1600 : 600);
  } else {
    console.log(`[dev-safe] No process found on port ${DEV_PORT}`);
  }

  let removed = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const wipe = (p) => rm(p, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
      await wipe(".next");
      await sleep(120);
      await wipe(".next-dev");
      await sleep(120);
      await wipe(".next-build");
      // Webpack / tooling caches — stale entries contribute to "Cannot find module './NNNN.js'" on Windows.
      if (existsSync("node_modules/.cache")) {
        await sleep(80);
        await wipe("node_modules/.cache");
      }
      removed = true;
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(300 * attempt);
    }
  }
  if (!removed) {
    throw new Error("Failed to clear .next cache");
  }
  console.log("[dev-safe] Cleared .next cache (default distDir .next; dev server uses Webpack for stable Windows manifests — use npm run dev:turbopack for Turbopack)");
  await sleep(process.platform === "win32" ? 450 : 200);

  const child =
    process.platform === "win32"
      ? spawn("npm run dev:raw", {
          stdio: "inherit",
          shell: true,
          env: {
            ...process.env,
            // Use a dedicated dev dist directory to reduce Windows file-lock contention on .next.
            NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-dev"
          }
        })
      : spawn("npm", ["run", "dev:raw"], {
          stdio: "inherit",
          env: {
            ...process.env,
            NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-dev"
          }
        });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (error) => {
    console.error("[dev-safe] Failed to start dev server:", error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error("[dev-safe] Failed:", error);
  process.exit(1);
});

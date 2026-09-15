import { rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import { spawn, spawnSync } from "child_process";

const DEV_PORT = 3000;

// 운영 Supabase 접촉 방지(2026-09-15, dkbot P13 사건 2 재발 방지 — 대표님 승인 후 적용).
// dk-safety는 dev/운영 Supabase 프로젝트가 물리적으로 분리되기 전까지 이 목록이 실제
// 위험 신호였다. 분리 완료 후에도, 누군가 실수로 .env.local을 운영 값으로 되돌리면
// 다시 위험해지므로 이 목록은 유지한다.
//
// ★2026-09-16 수정: 최초 버전은 content.match(정규식)으로 첫 매치만 읽었다 — 이건
// dkbot 쪽에서 실제 사고(ROUTING.md "결함 F")를 낸 것과 동일한 파싱 결함이다.
// node --env-file은 같은 키가 여러 줄 있으면 "마지막" 값을 쓰는데, 정규식 첫 매치는
// "첫" 값을 읽어 서로 다른 값을 볼 수 있다. dkbot core/kernel/dk-safety-guard.ts의
// parseEnvFileNodeStyle()과 동일한 로직(마지막 값 우선 + 중복 키 자체를 위험 신호로
// 취급)으로 교체했다.
const KNOWN_PRODUCTION_SUPABASE_HOSTS = ["mfecdmvieeylxnbqecli.supabase.co"];

// node --env-file과 동일하게 마지막 값이 이긴다. 중복 정의된 키는 duplicateKeys에 담아
// 반환한다 — 값과 무관하게 그 자체가 위험 신호다(dkbot core/kernel/dk-safety-guard.ts의
// parseEnvFileNodeStyle과 동일한 로직, 대표님 지시: "같은 키가 두 번 정의된 상태는
// 값이 무엇이든 위험하다").
function parseEnvFileNodeStyle(content) {
  const values = {};
  const seenCount = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    seenCount[key] = (seenCount[key] ?? 0) + 1;
    values[key] = value;
  }
  const duplicateKeys = Object.keys(seenCount).filter((k) => seenCount[k] > 1);
  return { values, duplicateKeys };
}

async function checkNotProductionSupabase() {
  const envPath = ".env.local";
  if (!existsSync(envPath)) return; // 로컬 JSON 모드 등 — 확인 대상 없음
  const content = await readFile(envPath, "utf8");
  const { values, duplicateKeys } = parseEnvFileNodeStyle(content);

  // 중복 키는 값과 무관하게 위험 신호 — 지금 이긴 값이 우연히 dev라도, 다음 편집에서
  // 순서가 바뀌면 조용히 운영으로 바뀔 수 있는 불안정한 상태이기 때문이다.
  if (duplicateKeys.includes("NEXT_PUBLIC_SUPABASE_URL")) {
    console.error("\n" + "=".repeat(70));
    console.error("🚫 dev 서버 기동 차단 — .env.local에 NEXT_PUBLIC_SUPABASE_URL이 중복 정의되어 있습니다.");
    console.error("   node --env-file은 마지막 줄의 값을 사용하므로, 지금 어느 값이");
    console.error("   실제로 쓰이는지 이 검사만으로는 안전하게 보장할 수 없어");
    console.error("   값과 무관하게 차단됩니다. 중복 줄을 정리하세요.");
    console.error("=".repeat(70) + "\n");
    process.exit(1);
  }

  const url = values["NEXT_PUBLIC_SUPABASE_URL"];
  if (!url) return;

  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return;
  }
  if (!KNOWN_PRODUCTION_SUPABASE_HOSTS.includes(hostname)) return;

  if (process.env.DK_SAFETY_ALLOW_PRODUCTION_DEV === "1") {
    console.warn("\n" + "!".repeat(70));
    console.warn(`!! 경고: 이 dev 서버는 운영 Supabase(${hostname})를 가리킵니다.`);
    console.warn("!! DK_SAFETY_ALLOW_PRODUCTION_DEV=1 로 의도적으로 우회했습니다.");
    console.warn("!".repeat(70) + "\n");
    return;
  }

  console.error("\n" + "=".repeat(70));
  console.error(`🚫 dev 서버 기동 차단 — .env.local이 운영 Supabase(${hostname})를 가리킵니다.`);
  console.error("   개발용 프로젝트로 .env.local을 바꾸거나,");
  console.error("   정말 운영을 대상으로 dev 서버를 띄워야 한다면");
  console.error("   DK_SAFETY_ALLOW_PRODUCTION_DEV=1 npm run dev 로 명시적으로 우회하세요.");
  console.error("=".repeat(70) + "\n");
  process.exit(1);
}

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
  await checkNotProductionSupabase();

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

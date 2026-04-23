/**
 * GitHub 새 저장소 생성 → 푸시 → Vercel 프로젝트 연결 → .env.local 값을 Production/Preview에 등록 → dkansim.com 도메인 연결 → Git 연동
 *
 * 사전 준비(한 번):
 *   gh auth login
 *   npx vercel login
 * 또는 비대화형:
 *   set GITHUB_TOKEN=ghp_...   (classic PAT, repo 범위)
 *   set VERCEL_TOKEN=...       (https://vercel.com/account/tokens)
 *
 * 실행(프로젝트 루트):
 *   node scripts/setup-github-vercel.mjs
 *
 * 환경 변수(선택):
 *   GITHUB_REPO_NAME   기본 dk-safety
 *   VERCEL_PROJECT     기본 dk-safety (Vercel 프로젝트명)
 *   DOMAIN             기본 dkansim.com
 *   ENV_FILE           기본 .env.local
 *   SKIP_DOMAIN        1 이면 도메인 추가 생략
 *   SKIP_GIT_PUSH      1 이면 GitHub 생성/푸시 생략
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || "";
const REPO_NAME = process.env.GITHUB_REPO_NAME || "dk-safety";
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || REPO_NAME;
const DOMAIN = process.env.DOMAIN || "dkansim.com";
const ENV_FILE = process.env.ENV_FILE || ".env.local";
const SKIP_DOMAIN = process.env.SKIP_DOMAIN === "1";
const SKIP_GIT_PUSH = process.env.SKIP_GIT_PUSH === "1";

const git = process.platform === "win32" ? "git.exe" : "git";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf-8",
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", CI: "1" },
    ...opts
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim()
  };
}

function runNpxVercel(args) {
  const prefix = ["--yes", "vercel"];
  if (VERCEL_TOKEN) prefix.push("-t", VERCEL_TOKEN);
  prefix.push(...args);
  return run(process.platform === "win32" ? "npx.cmd" : "npx", prefix, {
    shell: process.platform === "win32"
  });
}

function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function isSensitiveKey(name) {
  const u = name.toUpperCase();
  if (u === "ADMIN_PASSWORD") return true;
  if (u.includes("SECRET")) return true;
  if (u.includes("SERVICE_ROLE") || u.includes("PRIVATE_KEY")) return true;
  if (u.includes("TOKEN") && !u.startsWith("NEXT_PUBLIC_")) return true;
  return false;
}

function gh(args) {
  return run("gh", args, { shell: process.platform === "win32" });
}

async function githubApi(method, path, body) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN 필요");
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { message: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.message || text}`);
  }
  return json;
}

function ensureGitIdentity() {
  const email = run(git, ["config", "user.email"]).stdout;
  const name = run(git, ["config", "user.name"]).stdout;
  if (!email) run(git, ["config", "user.email", "deploy@users.noreply.github.com"]);
  if (!name) run(git, ["config", "user.name", "dk-safety deploy"]);
}

function scrubRemoteUrl(url) {
  return url.replace(/\/\/[^@/]+@/, "//");
}

function getOriginHttps() {
  const u = run(git, ["remote", "get-url", "origin"]);
  if (!u.ok) return "";
  let url = u.stdout.trim();
  if (url.startsWith("git@github.com:")) {
    url = "https://github.com/" + url.slice("git@github.com:".length);
  }
  if (!url.endsWith(".git")) url += ".git";
  return scrubRemoteUrl(url);
}

async function ensureGitHubRemoteAndPush() {
  if (GITHUB_TOKEN) {
    const me = await githubApi("GET", "/user", null);
    const login = me.login;
    try {
      const created = await githubApi("POST", "/user/repos", {
        name: REPO_NAME,
        private: true,
        auto_init: false
      });
      console.log(`GitHub 저장소 생성: ${created.html_url}`);
    } catch (e) {
      if (String(e).includes("422")) {
        console.log(`저장소 ${REPO_NAME} 가 이미 있을 수 있음 → 기존 원격에 푸시 시도`);
      } else throw e;
    }
    const authed = `https://${login}:${GITHUB_TOKEN}@github.com/${login}/${REPO_NAME}.git`;
    const publicUrl = `https://github.com/${login}/${REPO_NAME}.git`;
    const hasOrigin = run(git, ["remote", "get-url", "origin"]).ok;
    if (!hasOrigin) {
      const a = run(git, ["remote", "add", "origin", authed]);
      if (!a.ok) {
        const s = run(git, ["remote", "set-url", "origin", authed]);
        if (!s.ok) {
          console.error(s.stderr);
          process.exit(1);
        }
      }
    } else {
      run(git, ["remote", "set-url", "origin", authed]);
    }

    run(git, ["add", "-A"]);
    const st = run(git, ["status", "--porcelain"]);
    if (st.stdout) {
      const c = run(git, ["commit", "-m", "chore: initial import dk-safety"]);
      if (!c.ok && !String(c.stderr).includes("nothing to commit")) {
        console.error(c.stderr);
        process.exit(1);
      }
    }
    const p = run(git, ["push", "-u", "origin", "main"]);
    if (!p.ok) {
      console.error("git push 실패:\n", p.stderr || p.stdout);
      process.exit(1);
    }
    console.log("git push 완료");
    run(git, ["remote", "set-url", "origin", publicUrl]);
    console.log("origin URL에서 토큰 제거함(보안)\n");
    return publicUrl;
  }

  const cr = gh(["repo", "create", REPO_NAME, "--private", "--source", ".", "--remote", "origin", "--push"]);
  if (!cr.ok) {
    console.error("gh repo create 실패:\n", cr.stderr || cr.stdout);
    process.exit(1);
  }
  console.log("GitHub 저장소 생성 및 최초 푸시(gh) 완료\n");
  return getOriginHttps();
}

function syncVercel(gitRemoteHttps) {
  console.log("Vercel 프로젝트 연결…");
  const link = runNpxVercel(["link", "--yes", "--project", VERCEL_PROJECT]);
  if (!link.ok) {
    console.error(link.stderr || link.stdout);
    process.exit(1);
  }
  console.log(link.stdout || "vercel link 완료");

  const envPath = join(root, ENV_FILE);
  if (!existsSync(envPath)) {
    console.warn(`\n경고: ${ENV_FILE} 없음 — 환경 변수 동기화 생략\n`);
  } else {
    const vars = parseEnvFile(readFileSync(envPath, "utf-8"));
    const targets = ["production", "preview"];
    for (const [key, raw] of Object.entries(vars)) {
      const value = raw ?? "";
      if (value === "") {
        console.log(`건너뜀(빈 값): ${key}`);
        continue;
      }
      const sens = isSensitiveKey(key);
      for (const env of targets) {
        const args = ["env", "add", key, env, "--yes", "--force"];
        if (sens) args.push("--sensitive");
        else args.push("--no-sensitive");
        args.push("--value", value);
        const r = runNpxVercel(args);
        if (!r.ok) {
          console.warn(`${key} (${env}): ${r.stderr || r.stdout}`);
        } else {
          console.log(`등록: ${key} → ${env}`);
        }
      }
    }
  }

  if (!SKIP_DOMAIN) {
    console.log(`\n도메인 연결: ${DOMAIN} → ${VERCEL_PROJECT}`);
    const d = runNpxVercel(["domains", "add", DOMAIN, VERCEL_PROJECT]);
    console.log(d.stdout || d.stderr || (d.ok ? "OK" : "domains add 종료"));
    const w = runNpxVercel(["domains", "add", `www.${DOMAIN}`, VERCEL_PROJECT]);
    console.log(w.stdout || w.stderr || `www.${DOMAIN} 시도 완료`);
    const ins = runNpxVercel(["domains", "inspect", DOMAIN]);
    console.log("\n--- DNS (도메인 등록업체에서 설정) ---\n", ins.stdout || ins.stderr);
  }

  const connectUrl = gitRemoteHttps || getOriginHttps();
  if (connectUrl) {
    console.log("\nGit ↔ Vercel 연동…");
    const gc = runNpxVercel(["git", "connect", connectUrl]);
    console.log(gc.stdout || gc.stderr || (gc.ok ? "git connect 완료" : "git connect 확인 필요"));
  }

  console.log("\n다음: Vercel 대시보드에서 Production 브랜치(main) 확인 후,\n  npx vercel --prod\n로 즉시 배포하거나 Git 푸시로 자동 배포하세요.\n도메인은 DNS 전파 후 활성화됩니다.");
}

async function main() {
  console.log("=== dk-safety: GitHub + Vercel 설정 ===\n");

  const ghAuth = gh(["auth", "token"]);
  const hasGh = ghAuth.ok && ghAuth.stdout.length > 0;
  if (!hasGh && !GITHUB_TOKEN) {
    console.error("GitHub: gh 로그인 또는 GITHUB_TOKEN 이 필요합니다.\n  gh auth login\n");
    process.exit(1);
  }

  const who = runNpxVercel(["whoami"]);
  if (!who.ok) {
    console.error(
      "Vercel: 로그인되지 않았습니다.\n  npx vercel login\n  또는 환경 변수 VERCEL_TOKEN 을 설정하세요.\n",
      who.stderr || who.stdout
    );
    process.exit(1);
  }
  console.log(`Vercel 계정: ${who.stdout}`);
  console.log(`GitHub: ${GITHUB_TOKEN ? "GITHUB_TOKEN 사용" : "gh CLI 사용"}\n`);

  if (!existsSync(join(root, ".git"))) {
    const i = run(git, ["init"]);
    if (!i.ok) {
      console.error(i.stderr);
      process.exit(1);
    }
    console.log("git init 완료");
  }

  ensureGitIdentity();
  run(git, ["branch", "-M", "main"]);

  let gitRemote = "";
  if (!SKIP_GIT_PUSH) {
    gitRemote = await ensureGitHubRemoteAndPush();
  } else {
    gitRemote = getOriginHttps();
  }

  syncVercel(gitRemote);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

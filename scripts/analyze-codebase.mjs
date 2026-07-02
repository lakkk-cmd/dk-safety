/**
 * src/app 아래의 실제 API route.ts / admin·hq page.tsx를 스캔해 project_features 테이블과
 * 대조한다. 새로 생긴 경로는 등록하고, 코드에서 사라진 경로는 deprecated 처리한다.
 *
 * 코드 리뷰로 확인된 설계 원칙(리네임 이중등록 방지, fix #4):
 * - 같은 카테고리·같은 상위 디렉토리(dirname) 안에서 "사라진 경로 1개 + 새 경로 1개"가
 *   1:1로만 대응되면 리네임으로 간주해 기존 행의 path를 UPDATE한다(신규 삽입 + deprecated
 *   이중 처리를 하지 않는다). 후보가 여러 개라 애매하면 안전하게 기존 방식(사라진 건
 *   deprecated, 새 건 신규 등록)으로 되돌아간다 — 잘못된 추측으로 엉뚱한 행을 리네임하는
 *   것보다 안전한 쪽을 택한다.
 *
 * 사용: node --env-file=.env.local scripts/analyze-codebase.mjs
 */
import { readdir } from "fs/promises";
import { join, dirname, basename } from "path";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const PROJECT_ROOT = process.cwd();
const APP_DIR = join(PROJECT_ROOT, "src/app");

async function walk(dir, onFile) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
    } else {
      onFile(fullPath, entry.name);
    }
  }
}

function toUrlPath(filePath) {
  return filePath
    .replace(join(APP_DIR), "")
    .replace(/\\/g, "/")
    .replace(/\/(route|page)\.(ts|tsx|js)$/, "") || "/";
}

async function detectRoutes() {
  const apis = [];
  const pages = [];
  await walk(APP_DIR, (fullPath, fileName) => {
    if (fileName === "route.ts" || fileName === "route.js") {
      const p = toUrlPath(fullPath);
      if (p.startsWith("/api")) apis.push(p);
    } else if (fileName === "page.tsx" || fileName === "page.ts") {
      const p = toUrlPath(fullPath);
      if (p.startsWith("/admin") || p.startsWith("/hq")) pages.push(p);
    }
  });
  return { apis, pages };
}

async function fetchRegistered(category) {
  const res = await fetch(
    `${url}/rest/v1/project_features?category=eq.${category}&status=eq.implemented&path=not.is.null&select=id,path`,
    { headers }
  );
  if (!res.ok) throw new Error(`조회 실패 (${category}): ${res.status} ${await res.text()}`);
  return res.json();
}

async function insertFeature(category, path) {
  const res = await fetch(`${url}/rest/v1/project_features`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      category,
      name: basename(path) || path,
      description: `자동 감지된 ${category === "api" ? "API" : "페이지"} (${path}) — 설명을 채워주세요`,
      status: "implemented",
      path,
      note: "코드베이스 자동 분석으로 등록됨",
    }),
  });
  if (!res.ok) throw new Error(`등록 실패 (${path}): ${res.status} ${await res.text()}`);
}

async function updateFeaturePath(id, newPath, renamedFrom) {
  const res = await fetch(`${url}/rest/v1/project_features?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({
      path: newPath,
      note: `코드베이스 자동 분석: 경로 변경 감지 (${renamedFrom} → ${newPath})`,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`경로 갱신 실패 (${renamedFrom} → ${newPath}): ${res.status} ${await res.text()}`);
}

async function deprecateFeature(id, path) {
  const res = await fetch(`${url}/rest/v1/project_features?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "deprecated", updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`deprecated 처리 실패 (${path}): ${res.status} ${await res.text()}`);
}

/** dirname이 같은 사라진 경로 1개 ↔ 새 경로 1개 쌍만 리네임으로 확정한다(1:1 아니면 건너뜀). */
function matchRenames(missing, added) {
  const renames = []; // { fromRow, toPath }
  const missingByDir = new Map();
  for (const row of missing) {
    const dir = dirname(row.path);
    if (!missingByDir.has(dir)) missingByDir.set(dir, []);
    missingByDir.get(dir).push(row);
  }
  const addedByDir = new Map();
  for (const path of added) {
    const dir = dirname(path);
    if (!addedByDir.has(dir)) addedByDir.set(dir, []);
    addedByDir.get(dir).push(path);
  }

  const matchedMissing = new Set();
  const matchedAdded = new Set();
  for (const [dir, missingRows] of missingByDir) {
    const addedPaths = addedByDir.get(dir) ?? [];
    if (missingRows.length === 1 && addedPaths.length === 1) {
      renames.push({ fromRow: missingRows[0], toPath: addedPaths[0] });
      matchedMissing.add(missingRows[0].path);
      matchedAdded.add(addedPaths[0]);
    }
  }

  return {
    renames,
    trueMissing: missing.filter((r) => !matchedMissing.has(r.path)),
    trueAdded: added.filter((p) => !matchedAdded.has(p)),
  };
}

async function syncCategory(category, detectedPaths, inScope) {
  // 스캔 범위 밖의 등록 행(예: 공개 페이지 '/', '/reservation' — 이 스크립트는 admin/hq
  // 페이지만 스캔한다)은 "감지되지 않았다"고 해서 deprecated 처리하면 안 된다.
  const registered = (await fetchRegistered(category)).filter((r) => inScope(r.path));
  const registeredPaths = new Set(registered.map((r) => r.path));
  const detectedSet = new Set(detectedPaths);

  const missing = registered.filter((r) => !detectedSet.has(r.path));
  const added = detectedPaths.filter((p) => !registeredPaths.has(p));

  const { renames, trueMissing, trueAdded } = matchRenames(missing, added);

  for (const { fromRow, toPath } of renames) {
    await updateFeaturePath(fromRow.id, toPath, fromRow.path);
    console.log(`🔀 [${category}] 리네임 감지: ${fromRow.path} → ${toPath}`);
  }
  for (const row of trueMissing) {
    await deprecateFeature(row.id, row.path);
    console.log(`⚠️  [${category}] deprecated 처리: ${row.path}`);
  }
  for (const path of trueAdded) {
    await insertFeature(category, path);
    console.log(`✅ [${category}] 신규 등록: ${path}`);
  }

  return { renamed: renames.length, deprecated: trueMissing.length, added: trueAdded.length };
}

async function main() {
  console.log("🔍 코드베이스 분석 시작...");
  const { apis, pages } = await detectRoutes();
  console.log(`감지된 API: ${apis.length}개, 감지된 admin/hq 페이지: ${pages.length}개`);

  const apiResult = await syncCategory("api", apis, (p) => p.startsWith("/api"));
  const pageResult = await syncCategory("page", pages, (p) => p.startsWith("/admin") || p.startsWith("/hq"));

  const totalChanges = apiResult.renamed + apiResult.deprecated + apiResult.added + pageResult.renamed + pageResult.deprecated + pageResult.added;
  if (totalChanges > 0) {
    // project_features가 바뀌었으니 컨텍스트 캐시를 무효화 — 다음 getProjectContext() 호출 시 재생성됨
    await fetch(`${url}/rest/v1/project_context_cache?context_type=eq.gemini_context`, {
      method: "DELETE",
      headers,
    });
    console.log("🗑️  컨텍스트 캐시 무효화 완료 (다음 조회 시 최신 상태로 재생성됨)");
  }

  console.log(
    `\n📊 분석 완료 — API: 리네임 ${apiResult.renamed}/deprecated ${apiResult.deprecated}/신규 ${apiResult.added}, ` +
      `페이지: 리네임 ${pageResult.renamed}/deprecated ${pageResult.deprecated}/신규 ${pageResult.added}`
  );
}

main().catch((err) => {
  console.error("분석 오류:", err);
  process.exit(1);
});

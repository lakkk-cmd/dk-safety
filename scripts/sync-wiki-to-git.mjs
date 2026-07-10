#!/usr/bin/env node
/**
 * Supabase에 흩어진 AI 에이전트 운영 데이터(project_features, market_intelligence_insights,
 * agent_memory)를 brain/ops/ 폴더의 마크다운 파일로 동기화한다. brain/ 전체를 옵시디언
 * 볼트로 열 수 있다.
 *
 * brain/ops/는 dk-brain 3층 구조의 "운영 데이터 미러"다 — 매일/매주 갱신되는 고회전 데이터라
 * knowledge_base/knowledge_chunks 임베딩 대상(scripts/brain-sync.ts)에서 의도적으로 제외한다.
 * 정적 지식(brain/wiki/systems, profile, playbooks, lessons)만 임베딩한다.
 *
 * 각 파일은 <!-- AUTO:START -->~<!-- AUTO:END --> 구간만 매 실행마다 덮어쓴다.
 * 그 아래 "## 메모" 구간은 사람이 옵시디언에서 직접 적어도 재실행 시 보존된다.
 *
 * 이 스크립트는 로컬 파일만 생성한다 — git add/commit/push는 하지 않는다(직접 검토 후 커밋).
 *
 * 사용: npm run brain:sync:ops
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const WIKI_DIR = path.join(ROOT, "brain", "ops");
const AUTO_START = "<!-- AUTO:START -->";
const AUTO_END = "<!-- AUTO:END -->";
const DEFAULT_NOTES = "## 메모 (수동 편집 영역 — sync가 건드리지 않습니다)\n\n";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

function slugify(text) {
  const base = String(text)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "untitled";
}

async function readExisting(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** 기존 파일에서 AUTO:END 이후(사람이 적은 메모)를 보존하고, 그 앞은 새로 채운다. */
function mergeContent({ frontmatter, autoBody, existing }) {
  let notes = DEFAULT_NOTES;
  if (existing) {
    const endIdx = existing.indexOf(AUTO_END);
    if (endIdx >= 0) {
      const preserved = existing.slice(endIdx + AUTO_END.length).trimStart();
      if (preserved) notes = preserved;
    }
  }
  return `${frontmatter}\n\n${AUTO_START}\n${autoBody.trim()}\n${AUTO_END}\n\n${notes}`;
}

async function writePage(relPath, { title, category, tags = [], links = [], autoBody, sourceNote }) {
  const filePath = path.join(WIKI_DIR, relPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readExisting(filePath);

  const frontmatter = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `category: ${category}`,
    tags.length ? `tags: [${tags.map((t) => `"${t}"`).join(", ")}]` : "tags: []",
    sourceNote ? `source: "${sourceNote}"` : null,
    `synced_at: "${new Date().toISOString()}"`,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const linkLine = links.length ? `\n\n관련: ${links.map((l) => `[[${l}]]`).join(" ")}` : "";
  const content = mergeContent({ frontmatter, autoBody: `${autoBody.trim()}${linkLine}`, existing });
  await fs.writeFile(filePath, content, "utf-8");

  return { relPath, title, category };
}

async function syncFeatures() {
  const { data, error } = await supabase
    .from("project_features")
    .select("category, name, description, status, path, tech_stack, note")
    .order("category")
    .order("name");
  if (error) throw new Error(`project_features 조회 실패: ${error.message}`);

  const byCategory = new Map();
  for (const row of data ?? []) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push(row);
  }

  const pages = [];
  for (const [category, rows] of byCategory) {
    const body = rows
      .map((r) => {
        const stack = r.tech_stack?.length ? ` — ${r.tech_stack.join(", ")}` : "";
        const statusTag = r.status !== "implemented" ? ` \`${r.status}\`` : "";
        const pathLine = r.path ? ` (\`${r.path}\`)` : "";
        const note = r.note ? `\n  - 메모: ${r.note}` : "";
        return `- **${r.name}**${statusTag}${pathLine}: ${r.description}${stack}${note}`;
      })
      .join("\n");
    pages.push(
      await writePage(`features/${category}.md`, {
        title: `기능 현황 — ${category}`,
        category: "features",
        tags: ["project-features", category],
        links: ["index"],
        autoBody: `## ${category} (${rows.length}건)\n\n${body}`,
        sourceNote: "project_features",
      }),
    );
  }
  return pages;
}

async function syncMarketIntelligence() {
  const { data, error } = await supabase
    .from("market_intelligence_insights")
    .select("date, category, trend_keywords, insight, content_ideas")
    .order("date", { ascending: false });
  if (error) throw new Error(`market_intelligence_insights 조회 실패: ${error.message}`);

  const byCategory = new Map();
  for (const row of data ?? []) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category).push(row);
  }

  const pages = [];
  for (const [category, rows] of byCategory) {
    const recent = rows.slice(0, 12);
    const body = recent
      .map((r) => {
        const ideas =
          Array.isArray(r.content_ideas) && r.content_ideas.length
            ? `\n- 콘텐츠 아이디어: ${r.content_ideas
                .map((i) => (typeof i === "string" ? i : i.title ?? JSON.stringify(i)))
                .join(" / ")}`
            : "";
        return `### ${r.date}\n- 트렌드 키워드: ${(r.trend_keywords ?? []).join(", ") || "(없음)"}\n- 인사이트: ${
          r.insight || "(없음)"
        }${ideas}`;
      })
      .join("\n\n");
    pages.push(
      await writePage(`market-intelligence/${category}.md`, {
        title: `마켓 인텔리전스 — ${category}`,
        category: "market-intelligence",
        tags: ["market-intelligence", category],
        links: ["index", "content-performance-lessons"],
        autoBody: `## ${category} 최근 인사이트 (최근 ${recent.length}건)\n\n${body || "_(아직 데이터 없음)_"}`,
        sourceNote: "market_intelligence_insights",
      }),
    );
  }
  return pages;
}

async function syncAgentMemory() {
  const { data, error } = await supabase.from("agent_memory").select("key, content, updated_at");
  if (error) throw new Error(`agent_memory 조회 실패: ${error.message}`);

  const pages = [];
  for (const row of data ?? []) {
    const slug = slugify(row.key);
    let body = row.content ?? "";
    try {
      const parsed = JSON.parse(body);
      body = "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
    } catch {
      body = body.trim() ? body : "_(비어 있음)_";
    }

    const links =
      row.key === "content_performance_lessons"
        ? ["index", "전기안전", "자격시험", "실무"]
        : ["index"];

    pages.push(
      await writePage(`agent-memory/${slug}.md`, {
        title: `에이전트 메모리 — ${row.key}`,
        category: "agent-memory",
        tags: ["agent-memory", row.key],
        links,
        autoBody: `## ${row.key}\n\n마지막 갱신: ${row.updated_at}\n\n${body}`,
        sourceNote: `agent_memory (key=${row.key})`,
      }),
    );
  }
  return pages;
}

async function writeIndex(allPages) {
  const byCategory = new Map();
  for (const p of allPages) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category).push(p);
  }

  const lines = [
    "---",
    'title: "위키 목차"',
    "category: index",
    `synced_at: "${new Date().toISOString()}"`,
    "---",
    "",
    "# dk-safety AI 지식 위키",
    "",
    "이 파일은 `npm run wiki:sync`가 자동 생성합니다. 직접 수정하지 마세요.",
    "",
  ];

  for (const [category, pages] of byCategory) {
    lines.push(`## ${category}`, "");
    for (const p of pages.sort((a, b) => a.title.localeCompare(b.title, "ko"))) {
      const slug = path.basename(p.relPath, ".md");
      lines.push(`- [[${slug}|${p.title}]]`);
    }
    lines.push("");
  }

  await fs.writeFile(path.join(WIKI_DIR, "index.md"), lines.join("\n"), "utf-8");
}

async function main() {
  console.log("Supabase → brain/ops/ 마크다운 동기화 시작...");
  const pages = [];
  pages.push(...(await syncFeatures()));
  pages.push(...(await syncMarketIntelligence()));
  pages.push(...(await syncAgentMemory()));
  await writeIndex(pages);
  console.log(`완료: 페이지 ${pages.length}개 동기화, brain/ops/index.md 갱신.`);
  console.log("파일만 생성했습니다 — 내용을 검토한 뒤 직접 git add/commit 하세요.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

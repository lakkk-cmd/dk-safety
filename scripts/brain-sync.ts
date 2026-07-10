#!/usr/bin/env node
/**
 * brain/wiki/**\/*.md (정적 지식: systems/profile/playbooks/lessons)를 knowledge_base
 * (OpenRouter 임베딩, 9-에이전트 채팅·현장 AI 소견이 읽음)와 knowledge_chunks(Voyage AI
 * 임베딩, 풀 에이전트가 읽음) 양쪽에 동기화한다.
 *
 * brain/ops/(운영 데이터 미러)는 대상에서 제외한다 — 매일 갈아치우는 고회전 데이터를 RAG에
 * 계속 밀어넣으면 오래된 정보가 쌓여 답변 품질을 오염시키기 때문 (brain/ops/README.md 참고).
 *
 * 변경분만 처리: brain/.brain-sync-manifest.json에 파일별 해시를 기록해 비교한다.
 * 삭제/이동된 문서는 두 지식베이스 모두에서 관련 행을 제거하고 manifest에서도 뺀다.
 *
 * [[링크]]는 두 테이블 모두 관련 문서를 담을 메타데이터 컬럼이 없어(스키마 변경 없이 가려고
 * 의도적으로 피함), 임베딩되는 본문 끝에 "관련 문서: ..." 텍스트로 붙여 RAG 검색 시 연관
 * 문서 힌트로 쓰이게 한다.
 *
 * OPENROUTER_API_KEY 또는 VOYAGE_API_KEY 둘 중 하나가 없으면 해당 지식베이스만 건너뛰고
 * 나머지는 계속 진행한다(로컬 dev 환경에 키 하나만 있는 경우가 흔함).
 *
 * 사용: npm run brain:sync
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { embedText } from "@/lib/embeddings";
import { chunkText, embedChunks, saveChunks } from "@/lib/knowledge-embed";

const ROOT = process.cwd();
const WIKI_DIR = path.join(ROOT, "brain", "wiki");
const MANIFEST_PATH = path.join(ROOT, "brain", ".brain-sync-manifest.json");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
const hasVoyage = Boolean(process.env.VOYAGE_API_KEY?.trim());
if (!hasOpenRouter) console.warn("OPENROUTER_API_KEY 미설정 — knowledge_base 동기화는 건너뜁니다.");
if (!hasVoyage) console.warn("VOYAGE_API_KEY 미설정 — knowledge_chunks 동기화는 건너뜁니다.");

type Manifest = Record<
  string,
  { hash: string; syncedAt: string; syncedTargets: { knowledgeBase: boolean; knowledgeChunks: boolean } }
>;

async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveManifest(manifest: Manifest): Promise<void> {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

async function listWikiFiles(): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".md")) results.push(full);
    }
  }
  await walk(WIKI_DIR);
  return results;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function parsePage(raw: string, relPath: string) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter = fmMatch ? fmMatch[1] : "";
  const body = (fmMatch ? fmMatch[2] : raw).trim();

  const titleMatch = frontmatter.match(/title:\s*"?([^"\n]+)"?/);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(relPath, ".md");

  const category = relPath.split("/")[2] ?? "wiki"; // relPath는 항상 "/" 구분자로 정규화됨 (brain/wiki/<category>/...)

  const links = [...body.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1].trim());
  const uniqueLinks = [...new Set(links)];
  const linkLine = uniqueLinks.length ? `\n\n관련 문서: ${uniqueLinks.join(", ")}` : "";

  return { title, category, content: `${body}${linkLine}` };
}

async function syncToKnowledgeBase(sourceKey: string, title: string, category: string, content: string) {
  const { error: delErr } = await supabase.from("knowledge_base").delete().eq("source", sourceKey);
  if (delErr) throw new Error(`knowledge_base 삭제 실패(${sourceKey}): ${delErr.message}`);

  const embedding = await embedText(`${title}\n${content}`);
  const { error: insErr } = await supabase
    .from("knowledge_base")
    .insert({ source: sourceKey, title, content, category, embedding });
  if (insErr) throw new Error(`knowledge_base 삽입 실패(${sourceKey}): ${insErr.message}`);
}

async function syncToKnowledgeChunks(sourceKey: string, content: string) {
  const chunks = chunkText(content);
  if (chunks.length === 0) return;
  const embeddings = await embedChunks(chunks);
  await saveChunks(sourceKey, chunks, embeddings);
}

async function deleteFromBoth(sourceKey: string) {
  if (hasOpenRouter) await supabase.from("knowledge_base").delete().eq("source", sourceKey);
  await supabase.from("knowledge_chunks").delete().eq("source_file", sourceKey);
}

async function main() {
  console.log("brain/wiki/ → knowledge_base + knowledge_chunks 동기화 시작...");
  const manifest = await loadManifest();
  const files = await listWikiFiles();
  const currentKeys = new Set<string>();

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    currentKeys.add(relPath);
    const raw = await fs.readFile(filePath, "utf-8");
    const hash = hashContent(raw);

    const prior = manifest[relPath];
    const unchanged = prior?.hash === hash;
    // 내용이 같아도, 그때는 없던 키가 지금 생겨서 아직 그 타겟에 한 번도 동기화 안 된 경우엔
    // 건너뛰지 않는다 — 그래야 나중에 키를 추가했을 때 기존 문서들이 누락되지 않는다.
    const needsKnowledgeBase = hasOpenRouter && !(unchanged && prior?.syncedTargets?.knowledgeBase);
    const needsKnowledgeChunks = hasVoyage && !(unchanged && prior?.syncedTargets?.knowledgeChunks);

    if (unchanged && !needsKnowledgeBase && !needsKnowledgeChunks) {
      skipped++;
      continue;
    }

    const { title, category, content } = parsePage(raw, relPath);
    process.stdout.write(`동기화 중: ${relPath} ... `);
    try {
      if (needsKnowledgeBase) await syncToKnowledgeBase(relPath, title, category, content);
      if (needsKnowledgeChunks) await syncToKnowledgeChunks(relPath, content);
      manifest[relPath] = {
        hash,
        syncedAt: new Date().toISOString(),
        syncedTargets: {
          knowledgeBase: hasOpenRouter ? true : Boolean(prior?.syncedTargets?.knowledgeBase),
          knowledgeChunks: hasVoyage ? true : Boolean(prior?.syncedTargets?.knowledgeChunks),
        },
      };
      synced++;
      console.log("완료");
    } catch (e) {
      failed++;
      console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
    }

    await new Promise((r) => setTimeout(r, 300)); // 레이트 리밋 방지
  }

  // 삭제/이동된 문서 정리
  let removed = 0;
  for (const oldKey of Object.keys(manifest)) {
    if (!currentKeys.has(oldKey)) {
      await deleteFromBoth(oldKey);
      delete manifest[oldKey];
      removed++;
      console.log(`제거됨(파일 없음): ${oldKey}`);
    }
  }

  await saveManifest(manifest);
  console.log(
    `\n완료: 동기화 ${synced} · 건너뜀(변경없음) ${skipped} · 실패 ${failed} · 삭제정리 ${removed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

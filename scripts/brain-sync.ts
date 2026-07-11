#!/usr/bin/env node
/**
 * brain/wiki/**\/*.md (정적 지식: systems/profile/playbooks/lessons)를 knowledge 테이블
 * (듀얼 임베딩: OpenRouter — 9-에이전트 채팅·현장 AI 소견이 읽음, Voyage — 풀 에이전트가
 * 읽음)에 동기화한다.
 *
 * brain/ops/(운영 데이터 미러)는 대상에서 제외한다 — 매일 갈아치우는 고회전 데이터를 RAG에
 * 계속 밀어넣으면 오래된 정보가 쌓여 답변 품질을 오염시키기 때문 (brain/ops/README.md 참고).
 *
 * 변경분만 처리: brain/.brain-sync-manifest.json에 파일별 해시를 기록해 비교한다.
 * 삭제/이동된 문서는 knowledge 테이블에서 관련 행을 제거하고 manifest에서도 뺀다.
 *
 * [[링크]]는 knowledge 테이블에 관련 문서를 담을 메타데이터 컬럼이 없어(스키마 변경 없이
 * 가려고 의도적으로 피함), 임베딩되는 본문 끝에 "관련 문서: ..." 텍스트로 붙여 RAG 검색 시
 * 연관 문서 힌트로 쓰이게 한다.
 *
 * OPENROUTER_API_KEY 또는 VOYAGE_API_KEY 둘 중 하나가 없으면 해당 임베딩만 비워두고
 * 나머지는 계속 진행한다(로컬 dev 환경에 키 하나만 있는 경우가 흔함) — saveKnowledgeRows가
 * 공급자별 실패를 개별 처리하므로 여기서는 그대로 호출만 하면 된다.
 *
 * 사용: npm run brain:sync
 */
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { chunkTextWithOverlap } from "@/lib/knowledge-pdf-pipeline";
import { deleteKnowledgeBySource, saveKnowledgeRows } from "@/lib/knowledge-store";

const ROOT = process.cwd();
const WIKI_DIR = path.join(ROOT, "brain", "wiki");
const MANIFEST_PATH = path.join(ROOT, "brain", ".brain-sync-manifest.json");

// knowledge-store.ts가 내부적으로 requireAgentSupabase()를 쓰므로 여기서 별도 client는
// 필요 없다 — 자격증명 누락은 조기에 명확한 메시지로 알리기 위해 여기서 한 번 더 확인한다.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
  process.exit(1);
}

const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
const hasVoyage = Boolean(process.env.VOYAGE_API_KEY?.trim());
if (!hasOpenRouter) console.warn("OPENROUTER_API_KEY 미설정 — embedding_openrouter는 비워둔 채 진행합니다.");
if (!hasVoyage) console.warn("VOYAGE_API_KEY 미설정 — embedding_voyage는 비워둔 채 진행합니다.");

type Manifest = Record<string, { hash: string; syncedAt: string; hasOpenRouter: boolean; hasVoyage: boolean }>;

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

const SYNC_BATCH_SIZE = 20;

/** wiki 문서 1건을 chunkTextWithOverlap으로 나눠 knowledge 테이블에 듀얼 임베딩으로 저장한다.
 *  PDF와 동일한 청크 전략을 써서, 예전처럼 knowledge_base엔 전체글 1행 / knowledge_chunks엔
 *  고정크기 청크로 이중 분할하던 불일치를 없앤다. */
async function syncToKnowledge(
  sourceKey: string,
  title: string,
  category: string,
  content: string,
): Promise<{ openRouterOk: boolean; voyageOk: boolean }> {
  await deleteKnowledgeBySource(sourceKey);
  const chunks = chunkTextWithOverlap(content);
  if (chunks.length === 0) return { openRouterOk: false, voyageOk: false };

  let openRouterOk = hasOpenRouter;
  let voyageOk = hasVoyage;
  for (let cursor = 0; cursor < chunks.length; cursor += SYNC_BATCH_SIZE) {
    const batch = chunks.slice(cursor, cursor + SYNC_BATCH_SIZE);
    const result = await saveKnowledgeRows(
      batch.map((chunkContent, i) => ({
        source: sourceKey,
        title: chunks.length > 1 ? `${title} (${cursor + i + 1}/${chunks.length})` : title,
        content: chunkContent,
        category,
        chunkIndex: cursor + i,
      })),
    );
    if (result.saved === 0) {
      throw new Error(`knowledge 삽입 실패(${sourceKey}): ${result.openRouterError ?? result.voyageError ?? "알 수 없는 오류"}`);
    }
    if (result.openRouterError) openRouterOk = false;
    if (result.voyageError) voyageOk = false;
  }
  return { openRouterOk, voyageOk };
}

async function main() {
  console.log("brain/wiki/ → knowledge 테이블 동기화 시작...");
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
    // 내용이 같아도, 그때는 없던 키가 지금 생겨서 아직 그 임베딩을 한 번도 못 받은 경우엔
    // 건너뛰지 않는다 — 그래야 나중에 키를 추가했을 때 기존 문서들이 누락되지 않는다.
    const needsSync = !unchanged || (hasOpenRouter && !prior?.hasOpenRouter) || (hasVoyage && !prior?.hasVoyage);

    if (!needsSync) {
      skipped++;
      continue;
    }

    const { title, category, content } = parsePage(raw, relPath);
    process.stdout.write(`동기화 중: ${relPath} ... `);
    try {
      const { openRouterOk, voyageOk } = await syncToKnowledge(relPath, title, category, content);
      manifest[relPath] = { hash, syncedAt: new Date().toISOString(), hasOpenRouter: openRouterOk, hasVoyage: voyageOk };
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
      await deleteKnowledgeBySource(oldKey);
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

#!/usr/bin/env node
/**
 * 1회성 백필: 옛 knowledge_base(OpenRouter)+knowledge_chunks(Voyage)를 통합 knowledge
 * 테이블(066 마이그레이션)로 이관한다. 이 스크립트는 066(테이블 생성) 적용 후, 067(RPC
 * 컷오버) 적용 전에 실행할 것 — 컷오버 전이라 기존 검색 RPC는 옛 테이블을 계속 보므로
 * 서비스 영향 없이 백필하고 검증할 수 있다.
 *
 * 두 옛 테이블은 청크 분할 방식이 서로 달라(knowledge_base: chunkTextWithOverlap 문장겹침,
 * knowledge_chunks: 고정크기 500/50 — wiki는 knowledge_base엔 전체글 1행) 행 단위로 정확히
 * 짝지어 병합할 수 없다. 대신 각 옛 테이블의 모든 행을 그대로 knowledge로 옮기면서, 그
 * 행에 원래 없던 쪽 임베딩을 같은 content로 새로 계산해 채운다 — 결과적으로 모든 행이 두
 * 임베딩을 다 갖게 되어, 9-에이전트 채팅(OpenRouter)과 풀 에이전트(Voyage) 둘 다 모든
 * 기존 지식(특히 지금까지 knowledge_chunks에만 있던 web-learn 지식)을 볼 수 있게 된다 —
 * 이게 이번 통합의 핵심 목표.
 *
 * 부수 효과: 둘 다 임베딩을 갖고 있던 소스(PDF 업로드, wiki)는 두 옛 테이블의 서로 다른
 * 청크 경계가 각각 별도 행으로 들어가 약간 중복된다. 기능상 문제는 없고(RAG 검색이 유사
 * 청크를 두 번 반환할 뿐), wiki는 이 스크립트 이후 `npm run brain:sync`를 한 번 더 돌리면
 * (source 삭제 후 재적재라) chunkTextWithOverlap 기준 단일 청크셋으로 정리된다. PDF는
 * `/admin/knowledge`에서 "재학습"을 누르면 같은 방식으로 정리된다.
 *
 * Usage: npx tsx --env-file=.env.local scripts/migrate-knowledge-unify.ts
 */
import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/embeddings";
import { embedChunks } from "@/lib/knowledge-embed";

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
  process.exit(1);
}
if (!process.env.OPENROUTER_API_KEY?.trim() || !process.env.VOYAGE_API_KEY?.trim()) {
  console.error("OPENROUTER_API_KEY 와 VOYAGE_API_KEY 가 모두 필요합니다 — 백필은 누락된 쪽 임베딩을 새로 계산합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const BATCH_SIZE = 20;
const PAGE_SIZE = 1000;

type KnowledgeBaseRow = {
  id: string;
  source: string;
  title: string;
  content: string;
  category: string | null;
  is_external: boolean;
  expires_at: string | null;
  pdf_id: string | null;
};
type KnowledgeChunksRow = {
  id: number;
  source_file: string;
  chunk_index: number;
  content: string;
};

async function fetchAllRows<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function migrateFromKnowledgeBase(): Promise<{ migrated: number; failed: number }> {
  const rows = await fetchAllRows<KnowledgeBaseRow>(
    "knowledge_base",
    "id, source, title, content, category, is_external, expires_at, pdf_id",
  );
  console.log(`knowledge_base: ${rows.length}건 조회됨`);

  let migrated = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const contents = batch.map((r) => r.content);
      const [openRouterEmbeddings, voyageEmbeddings] = await Promise.all([
        embedTexts(contents),
        embedChunks(contents),
      ]);
      const insertRows = batch.map((r, j) => ({
        source: r.source,
        title: r.title,
        content: r.content,
        category: r.category,
        chunk_index: null,
        is_external: r.is_external,
        expires_at: r.expires_at,
        pdf_id: r.pdf_id,
        embedding_openrouter: openRouterEmbeddings[j] ?? null,
        embedding_voyage: voyageEmbeddings[j] ?? null,
      }));
      const { error } = await supabase.from("knowledge").insert(insertRows);
      if (error) throw new Error(error.message);
      migrated += insertRows.length;
    } catch (err) {
      failed += batch.length;
      console.error(`\n  배치 실패(${i}~${i + batch.length}): ${err instanceof Error ? err.message : err}`);
    }
    process.stdout.write(`\r  knowledge_base 이관: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log();
  return { migrated, failed };
}

async function migrateFromKnowledgeChunks(): Promise<{ migrated: number; failed: number }> {
  const rows = await fetchAllRows<KnowledgeChunksRow>(
    "knowledge_chunks",
    "id, source_file, chunk_index, content",
  );
  console.log(`knowledge_chunks: ${rows.length}건 조회됨`);

  let migrated = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const contents = batch.map((r) => r.content);
      const [openRouterEmbeddings, voyageEmbeddings] = await Promise.all([
        embedTexts(contents),
        embedChunks(contents),
      ]);
      const insertRows = batch.map((r, j) => ({
        source: r.source_file,
        title: `${r.source_file} (청크 ${r.chunk_index + 1})`,
        content: r.content,
        category: null,
        chunk_index: r.chunk_index,
        // web-learn(Tavily/Firecrawl)이 붙이는 접두사 — external-knowledge.ts와 동일하게
        // "외부 웹 수집" 항목으로 분류한다(PDF/시드 등 내부 문서는 접두사가 없어 false).
        is_external: r.source_file.startsWith("web:"),
        expires_at: null,
        pdf_id: null,
        embedding_openrouter: openRouterEmbeddings[j] ?? null,
        embedding_voyage: voyageEmbeddings[j] ?? null,
      }));
      const { error } = await supabase.from("knowledge").insert(insertRows);
      if (error) throw new Error(error.message);
      migrated += insertRows.length;
    } catch (err) {
      failed += batch.length;
      console.error(`\n  배치 실패(${i}~${i + batch.length}): ${err instanceof Error ? err.message : err}`);
    }
    process.stdout.write(`\r  knowledge_chunks 이관: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
  console.log();
  return { migrated, failed };
}

async function main() {
  console.log("knowledge_base + knowledge_chunks → knowledge 백필 시작...\n");

  const { count: existing } = await supabase.from("knowledge").select("id", { count: "exact", head: true });
  if (existing && existing > 0) {
    console.warn(`⚠️  knowledge 테이블에 이미 ${existing}건이 있습니다. 이 스크립트를 재실행하면`);
    console.warn(`   중복 이관됩니다 — 재실행 전 테이블을 비우거나 필요성을 먼저 확인하세요.`);
    console.warn(`   5초 후 계속 진행합니다 (Ctrl+C로 중단 가능)...`);
    await new Promise((r) => setTimeout(r, 5000));
  }

  const kb = await migrateFromKnowledgeBase();
  const kc = await migrateFromKnowledgeChunks();

  console.log("\n=== 백필 완료 ===");
  console.log(`knowledge_base → knowledge: ${kb.migrated}건 성공, ${kb.failed}건 실패`);
  console.log(`knowledge_chunks → knowledge: ${kc.migrated}건 성공, ${kc.failed}건 실패`);

  const { count: total } = await supabase.from("knowledge").select("id", { count: "exact", head: true });
  console.log(`knowledge 테이블 총 행 수: ${total ?? "확인 실패"}`);
  console.log(
    "\n다음 단계: 행 수·샘플 쿼리로 검증한 뒤 supabase/migrations/067_knowledge_unify_cutover.sql을 " +
      "적용하세요(npm run db:apply). 컷오버 후 `npm run brain:sync`를 한 번 더 돌리면 wiki 문서가 " +
      "chunkTextWithOverlap 기준 단일 청크셋으로 정리됩니다.",
  );

  if (kb.failed > 0 || kc.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

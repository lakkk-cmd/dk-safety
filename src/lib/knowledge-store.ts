/** knowledge 테이블(듀얼 임베딩: OpenRouter+Voyage) 저장/삭제 — 모든 생산자가 공유하는 단일
 *  쓰기 경로. 청크 분할은 호출부 책임(예: knowledge-pdf-pipeline.ts의 chunkTextWithOverlap) —
 *  이 모듈은 이미 분할된 행을 받아 두 임베딩 계산+저장만 한다.
 *
 *  호출부는 배치 크기를 적절히 나눠서 넘겨야 한다(OpenRouter/Voyage 요청 크기·레이트리밋 제한 —
 *  기존 관례상 20개 안팎). */

import { requireAgentSupabase } from "@/lib/agent-db";
import { embedTexts } from "@/lib/embeddings";
import { embedChunks } from "@/lib/knowledge-embed";

export type KnowledgeWriteRow = {
  source: string;
  title: string;
  content: string;
  category?: string | null;
  chunkIndex?: number | null;
  isExternal?: boolean;
  expiresAt?: string | null;
  pdfId?: string | null;
};

export type SaveKnowledgeResult = {
  saved: number;
  openRouterSaved: number;
  voyageSaved: number;
  openRouterError: string | null;
  voyageError: string | null;
};

const EMPTY_RESULT: SaveKnowledgeResult = {
  saved: 0,
  openRouterSaved: 0,
  voyageSaved: 0,
  openRouterError: null,
  voyageError: null,
};

/**
 * 행 배치를 받아 OpenRouter+Voyage 임베딩을 각각 독립적으로 계산해 knowledge 테이블에 저장한다.
 * 한쪽 공급자가 실패해도(레이트리밋 등) 성공한 쪽 임베딩은 저장한다 — 옛 파이프라인의
 * "두 임베딩 파이프라인 중 하나만 성공해도 결과 보존" 동작을 그대로 유지한다. 둘 다 실패한
 * 행은 저장하지 않는다.
 */
export async function saveKnowledgeRows(rows: KnowledgeWriteRow[]): Promise<SaveKnowledgeResult> {
  if (rows.length === 0) return EMPTY_RESULT;
  const supabase = requireAgentSupabase();
  const texts = rows.map((r) => r.content);

  let openRouterEmbeddings: (number[] | null)[] = rows.map(() => null);
  let openRouterError: string | null = null;
  try {
    openRouterEmbeddings = await embedTexts(texts);
  } catch (err) {
    openRouterError = err instanceof Error ? err.message : "OpenRouter 임베딩 실패";
  }

  let voyageEmbeddings: (number[] | null)[] = rows.map(() => null);
  let voyageError: string | null = null;
  try {
    voyageEmbeddings = await embedChunks(texts);
  } catch (err) {
    voyageError = err instanceof Error ? err.message : "Voyage 임베딩 실패";
  }

  const insertRows = rows
    .map((row, i) => ({
      source: row.source,
      title: row.title,
      content: row.content,
      category: row.category ?? null,
      chunk_index: row.chunkIndex ?? null,
      is_external: row.isExternal ?? false,
      expires_at: row.expiresAt ?? null,
      pdf_id: row.pdfId ?? null,
      embedding_openrouter: openRouterEmbeddings[i] ?? null,
      embedding_voyage: voyageEmbeddings[i] ?? null,
    }))
    .filter((r) => r.embedding_openrouter || r.embedding_voyage);

  if (insertRows.length === 0) {
    return {
      ...EMPTY_RESULT,
      openRouterError: openRouterError ?? "임베딩 결과 없음",
      voyageError: voyageError ?? "임베딩 결과 없음",
    };
  }

  const { error } = await supabase.from("knowledge").insert(insertRows);
  if (error) {
    return { ...EMPTY_RESULT, openRouterError: error.message, voyageError: error.message };
  }

  return {
    saved: insertRows.length,
    openRouterSaved: insertRows.filter((r) => r.embedding_openrouter).length,
    voyageSaved: insertRows.filter((r) => r.embedding_voyage).length,
    openRouterError,
    voyageError,
  };
}

/** source 키로 기존 행 전체 삭제 (같은 문서 재적재 전 중복 방지 — wiki/web-learn 재동기화용) */
export async function deleteKnowledgeBySource(source: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("knowledge").delete().eq("source", source);
  if (error) throw new Error(`knowledge 삭제 실패(source=${source}): ${error.message}`);
}

/** PDF 레코드에 연결된 청크 전체 삭제 (재학습 전 초기화용) */
export async function deleteKnowledgeByPdfId(pdfId: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("knowledge").delete().eq("pdf_id", pdfId);
  if (error) throw new Error(`knowledge 삭제 실패(pdf_id=${pdfId}): ${error.message}`);
}

/** is_external=true 항목 중 만료된 것만 삭제. category 지정 시 그 카테고리만. 삭제된 행 수 반환. */
export async function deleteExpiredExternalKnowledge(category?: string): Promise<number> {
  const supabase = requireAgentSupabase();
  let query = supabase
    .from("knowledge")
    .delete({ count: "exact" })
    .eq("is_external", true)
    .lt("expires_at", new Date().toISOString());
  if (category) query = query.eq("category", category);
  const { count, error } = await query;
  if (error) throw new Error(`만료 지식 삭제 실패: ${error.message}`);
  return count ?? 0;
}

/** RAG 검색 — Voyage AI로 임베딩한 knowledge_chunks 테이블에서 코사인 유사도 top-K 청크 반환.
 *  knowledge_base(searchKnowledgeBase, OpenRouter 임베딩)와는 독립된 별도 지식베이스다. */

import { createClient } from "@supabase/supabase-js";
import { embedChunks } from "@/lib/knowledge-embed";

type ChunkRow = { id: number; source_file: string; chunk_index: number; content: string; similarity: number };

/**
 * 질문을 Voyage AI로 임베딩 → match_chunks RPC로 유사 청크 검색 → 시스템 프롬프트에 바로
 * 덧붙일 수 있는 문자열로 반환한다. VOYAGE_API_KEY 미설정, 임베딩/RPC 오류, 빈 테이블 등
 * 어떤 이유로든 검색이 안 되면 빈 문자열을 반환해 호출부의 기존 답변 로직을 그대로 둔다.
 */
export async function searchKnowledgeChunks(query: string, topK = 5): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed || !process.env.VOYAGE_API_KEY) return "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return "";
  const supabase = createClient(url, key);

  try {
    const [embedding] = await embedChunks([trimmed]);
    if (!embedding) return "";

    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: embedding,
      match_count: topK
    });
    if (error || !data || (data as ChunkRow[]).length === 0) return "";

    const chunks = (data as ChunkRow[]).map((row) => `[${row.source_file}] ${row.content}`);
    return `다음 자료를 참고해서 답변하세요(자료가 영문이어도 답변은 반드시 한국어로 작성하세요):\n${chunks.join("\n\n")}`;
  } catch {
    return "";
  }
}

export type EvidenceChunk = { content: string; sourceFile: string; similarity: number };
export type EvidenceSearchResult = {
  chunks: EvidenceChunk[];
  hasEvidence: boolean;
  evidenceSummary: string;
  contextBlock: string;
};

const NO_EVIDENCE: EvidenceSearchResult = { chunks: [], hasEvidence: false, evidenceSummary: "관련 자료 없음", contextBlock: "" };

/**
 * searchKnowledgeChunks와 동일한 RAG 검색이지만, 유사도로 필터링한 구조화된 결과와 근거 요약을
 * 함께 반환한다 — 답변 아래 "근거 출처" 표시, 거짓정보 검증 시 "RAG 근거 있음/없음" 판단에 사용.
 */
export async function searchKnowledgeChunksWithEvidence(
  query: string,
  topK = 5,
  minSimilarity = 0.7
): Promise<EvidenceSearchResult> {
  const trimmed = query.trim();
  if (!trimmed || !process.env.VOYAGE_API_KEY) return NO_EVIDENCE;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NO_EVIDENCE;
  const supabase = createClient(url, key);

  try {
    const [embedding] = await embedChunks([trimmed]);
    if (!embedding) return NO_EVIDENCE;

    const { data, error } = await supabase.rpc("match_chunks", { query_embedding: embedding, match_count: topK });
    if (error || !data) return NO_EVIDENCE;

    const reliable = (data as ChunkRow[]).filter((row) => row.similarity >= minSimilarity);
    if (reliable.length === 0) return NO_EVIDENCE;

    const chunks = reliable.map((row) => ({ content: row.content, sourceFile: row.source_file, similarity: row.similarity }));
    const evidenceSummary = `관련 자료 ${chunks.length}건 발견:\n${chunks
      .map((c) => `- ${c.sourceFile} (유사도: ${(c.similarity * 100).toFixed(0)}%)`)
      .join("\n")}`;
    const contextBlock = `[참고 자료 — 질문과 관련 있다면 이 내용을 우선 근거로 답변하세요. 자료가 영문이어도 답변은 한국어로 작성하세요]\n${chunks
      .map((c) => `출처: ${c.sourceFile}\n${c.content}`)
      .join("\n\n")}`;

    return { chunks, hasEvidence: true, evidenceSummary, contextBlock };
  } catch {
    return NO_EVIDENCE;
  }
}

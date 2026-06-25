/** RAG 검색 — Voyage AI로 임베딩한 knowledge_chunks 테이블에서 코사인 유사도 top-K 청크 반환.
 *  knowledge_base(searchKnowledgeBase, OpenRouter 임베딩)와는 독립된 별도 지식베이스다. */

import { createClient } from "@supabase/supabase-js";
import { embedChunks } from "@/lib/knowledge-embed";

type ChunkRow = { id: number; source_file: string; chunk_index: number; content: string; similarity: number };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * 질문을 Voyage AI로 임베딩 → match_chunks RPC로 유사 청크 검색 → 시스템 프롬프트에 바로
 * 덧붙일 수 있는 문자열로 반환한다. VOYAGE_API_KEY 미설정, 임베딩/RPC 오류, 빈 테이블 등
 * 어떤 이유로든 검색이 안 되면 빈 문자열을 반환해 호출부의 기존 답변 로직을 그대로 둔다.
 */
export async function searchKnowledgeChunks(query: string, topK = 5): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed || !process.env.VOYAGE_API_KEY) return "";

  try {
    const [embedding] = await embedChunks([trimmed]);
    if (!embedding) return "";

    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: embedding,
      match_count: topK
    });
    if (error || !data || (data as ChunkRow[]).length === 0) return "";

    const chunks = (data as ChunkRow[]).map((row) => `[${row.source_file}] ${row.content}`);
    return `다음 자료를 참고해서 답변하세요:\n${chunks.join("\n\n")}`;
  } catch {
    return "";
  }
}

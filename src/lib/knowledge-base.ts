/** RAG 지식베이스 검색 — knowledge_base 테이블에서 코사인 유사도 top-K 청크 반환 */

import { requireAgentSupabase } from "@/lib/agent-db";
import { embedText } from "@/lib/embeddings";

type KbRow = { id: string; source: string; title: string; content: string; category: string | null; similarity: number };

/**
 * 질문 임베딩 → knowledge_base 유사도 검색 → 컨텍스트 텍스트 반환.
 * pgvector 미설치 등으로 실패 시 빈 문자열 반환 (에이전트 응답은 계속 진행).
 */
export async function searchKnowledgeBase(query: string, topK = 5): Promise<string> {
  try {
    const supabase = requireAgentSupabase();
    const embedding = await embedText(query);

    const { data, error } = await supabase.rpc("match_knowledge_base", {
      query_embedding: embedding,
      match_count: topK,
      similarity_threshold: 0.35,
    });

    if (error || !data || (data as KbRow[]).length === 0) return "";

    const chunks = (data as KbRow[]).map(
      (row) => `[${row.category ?? row.source}] ${row.title}\n${row.content}`,
    );

    return `[지식베이스 관련 정보]\n${chunks.join("\n\n")}`;
  } catch {
    return "";
  }
}

-- Voyage AI 기반 별도 PDF 임베딩 파이프라인용 테이블 (knowledge_base와는 독립된 벡터 공간, 1024차원)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id           BIGSERIAL PRIMARY KEY,
  source_file  TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(1024),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ivfflat 인덱스는 047에서 바로 제거된다(빈 테이블에 생성하면 클러스터링이 무의미해서
-- match_chunks가 실제 매치를 놓치는 문제 실측 확인 — 047 참고). 재실행 시 불필요하게
-- 인덱스를 만들었다가 바로 지우며 메모리를 낭비/실패하지 않도록 여기서는 만들지 않는다.

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1024),
  match_count     INT DEFAULT 5
)
RETURNS TABLE (
  id           BIGINT,
  source_file  TEXT,
  chunk_index  INTEGER,
  content      TEXT,
  similarity   FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.source_file,
    kc.chunk_index,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

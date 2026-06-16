-- pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 지식베이스 (RAG용 임베딩 저장)
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT         NOT NULL,
  title      TEXT         NOT NULL,
  content    TEXT         NOT NULL,
  embedding  vector(1536),
  category   TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 코사인 유사도 기반 검색 함수
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding    vector(1536),
  match_count        INT   DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  id         UUID,
  source     TEXT,
  title      TEXT,
  content    TEXT,
  category   TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    source,
    title,
    content,
    category,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.knowledge_base IS 'RAG 지식베이스 — 임베딩 텍스트 청크 (서비스 role 전용)';

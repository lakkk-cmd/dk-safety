-- knowledge_base 외부 데이터 수집 필드 추가

ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.knowledge_base.is_external IS 'true=웹 자동수집, false=내부 문서 수동 등록';
COMMENT ON COLUMN public.knowledge_base.expires_at  IS '이 시각 이후 검색 제외 (null=영구). 외부 수집 항목은 수집일+90일 자동 설정.';

-- 검색 함수에 만료 필터 추가 (유효 항목만 반환)
CREATE OR REPLACE FUNCTION match_knowledge_base(
  query_embedding      vector(1536),
  match_count          INT   DEFAULT 5,
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
    AND (expires_at IS NULL OR expires_at > now())
    AND 1 - (embedding <=> query_embedding) > similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- knowledge 통합 테이블(066)로 검색 RPC를 전환하는 컷오버.
-- scripts/migrate-knowledge-unify.ts로 knowledge 테이블 백필을 먼저 마치고 행 수·샘플 쿼리로
-- 검증한 뒤에 이 마이그레이션을 적용할 것 — 적용 즉시 모든 소비자(9-에이전트 채팅, 현장 AI
-- 소견, 풀 에이전트 안전게이트)가 knowledge_base/knowledge_chunks 대신 knowledge 테이블을
-- 읽는다.
--
-- 함수 이름·시그니처·반환 컬럼·필터링 로직(만료 필터, 유사도 임계값 0.4/기본 호출부는 0.35)은
-- 전부 기존과 동일하게 유지 — 소비자 코드(src/lib/knowledge-base.ts,
-- src/lib/knowledge-chunks-search.ts, src/app/api/knowledge/search/route.ts)는 무수정.

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
    1 - (embedding_openrouter <=> query_embedding) AS similarity
  FROM public.knowledge
  WHERE embedding_openrouter IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND 1 - (embedding_openrouter <=> query_embedding) > similarity_threshold
  ORDER BY embedding_openrouter <=> query_embedding
  LIMIT match_count;
$$;

-- knowledge.id는 UUID, 옛 knowledge_chunks.id는 BIGSERIAL이었다. 소비자 코드(ChunkRow.id: number)
-- 타입 호환을 위해 BIGINT를 유지해야 해서 UUID를 그대로 못 돌려준다 — 유사도 순위를 안정적인
-- 정수로 대신 반환한다(코드 확인 결과 이 id를 재조회에 쓰는 소비자는 없고 식별/정렬용으로만 씀).
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
LANGUAGE sql STABLE
AS $$
  SELECT
    row_number() OVER (ORDER BY embedding_voyage <=> query_embedding)::BIGINT AS id,
    source AS source_file,
    COALESCE(chunk_index, 0) AS chunk_index,
    content,
    1 - (embedding_voyage <=> query_embedding) AS similarity
  FROM public.knowledge
  WHERE embedding_voyage IS NOT NULL
  ORDER BY embedding_voyage <=> query_embedding
  LIMIT match_count;
$$;

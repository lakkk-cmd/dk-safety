-- 통합 지식베이스: knowledge_base(OpenRouter 1536d)와 knowledge_chunks(Voyage 1024d)를
-- 단일 테이블로 합친다. 임베딩 공급자는 그대로 유지(안전 게이트 재보정 회피) — 한 행에
-- 두 임베딩을 모두 저장해 9-에이전트 채팅/현장 AI 소견(OpenRouter)과 풀 에이전트 안전게이트
-- (Voyage, 유사도 0.7 임계값)가 같은 데이터를 각자의 벡터 공간으로 조회할 수 있게 한다.
--
-- 벡터 인덱스는 의도적으로 생성하지 않음 — 047_knowledge_chunks_drop_premature_ivfflat.sql에서
-- 배운 교훈(빈 테이블에 ivfflat을 만들면 클러스터링이 무의미해져 실제 매치를 놓침) 그대로 적용.
-- 데이터가 충분히 쌓인 뒤(수만 건 이상) 별도 마이그레이션에서 생성할 것.
--
-- 컷오버(match_knowledge_base/match_chunks RPC 전환)는 067에서 별도로 한다 — 이 마이그레이션
-- 적용 시점엔 기존 RPC가 여전히 knowledge_base/knowledge_chunks를 보므로 서비스 영향 없음.
-- scripts/migrate-knowledge-unify.ts로 백필 후 검증까지 마친 뒤 067을 적용할 것.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  source               TEXT         NOT NULL,
  title                TEXT         NOT NULL,
  content              TEXT         NOT NULL,
  category             TEXT,
  chunk_index          INT,
  embedding_openrouter vector(1536),
  embedding_voyage     vector(1024),
  is_external          BOOLEAN      NOT NULL DEFAULT false,
  expires_at           TIMESTAMPTZ,
  pdf_id               UUID         REFERENCES public.knowledge_pdfs(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_source_idx   ON public.knowledge (source);
CREATE INDEX IF NOT EXISTS knowledge_pdf_id_idx   ON public.knowledge (pdf_id);
CREATE INDEX IF NOT EXISTS knowledge_category_idx ON public.knowledge (category);

ALTER TABLE public.knowledge ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.knowledge IS
  'RAG 지식베이스 통합 테이블(서비스 role 전용, RLS 정책 없음). embedding_openrouter는
   9-에이전트 채팅/현장 AI 소견이, embedding_voyage는 풀 에이전트 안전게이트(유사도 0.7
   임계값)가 읽는다. knowledge_base/knowledge_chunks를 대체 — 옛 테이블은 롤백 안전판으로
   당분간 유지하고, 프로덕션 검증 후 별도 마이그레이션에서 삭제한다.';

COMMENT ON COLUMN public.knowledge.is_external IS 'true=웹 자동수집(external-knowledge/full-agent 도구), false=PDF/wiki 등 내부 문서';
COMMENT ON COLUMN public.knowledge.expires_at  IS '이 시각 이후 검색 제외(null=영구). 외부 수집 항목은 수집일+90일 자동 설정.';
COMMENT ON COLUMN public.knowledge.chunk_index IS '같은 source(PDF/문서) 내 청크 순번. 전체글 1행짜리(wiki 등)는 null.';

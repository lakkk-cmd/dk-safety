-- 029: 시장 정보 자동 수집 에이전트 (전기안전/자격시험/실무 카테고리 — 구글 뉴스/네이버/유튜브 수집 + Claude 인사이트)

-- 원시 수집 데이터 (날짜별 누적)
CREATE TABLE IF NOT EXISTS public.market_intelligence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL CHECK (category IN ('전기안전', '자격시험', '실무')),
  source       TEXT NOT NULL CHECK (source IN ('google_news', 'naver_datalab', 'naver_blog', 'youtube')),
  keyword      TEXT NOT NULL,
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS market_intelligence_category_idx
  ON public.market_intelligence (category, collected_at DESC);

-- Claude가 도출한 일별 트렌드 키워드/사업 인사이트/콘텐츠 기획안
CREATE TABLE IF NOT EXISTS public.market_intelligence_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  category      TEXT NOT NULL CHECK (category IN ('전기안전', '자격시험', '실무')),
  trend_keywords TEXT[] NOT NULL DEFAULT '{}',
  insight       TEXT NOT NULL DEFAULT '',
  content_ideas JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, category)
);

CREATE INDEX IF NOT EXISTS market_intelligence_insights_date_idx
  ON public.market_intelligence_insights (date DESC);

ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_intelligence_insights ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.market_intelligence IS '시장 정보 수집 에이전트 — 구글 뉴스/네이버/유튜브 원시 수집 데이터 (서버 service role 전용)';
COMMENT ON TABLE public.market_intelligence_insights IS '시장 정보 수집 에이전트 — Claude 분석 일별 트렌드 키워드/인사이트/콘텐츠 기획안 (서버 service role 전용)';

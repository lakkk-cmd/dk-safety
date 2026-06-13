-- 026: 콘텐츠 마케팅 사령부 (contents.dkansim.com) — 블로그, 네이버 트렌드, 유튜브/카카오 승인 큐, 유튜브 OAuth 토큰

-- 블로그 포스트 (dkansim.com/blog)
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL DEFAULT '',
  excerpt          TEXT,
  meta_description TEXT,
  keywords         TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_approval', 'published', 'rejected')),
  agent_source     TEXT,
  reject_reason    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS blog_posts_status_idx
  ON public.blog_posts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS blog_posts_published_idx
  ON public.blog_posts (published_at DESC)
  WHERE status = 'published';

-- 네이버 트렌드/경쟁 블로그 분석 결과
CREATE TABLE IF NOT EXISTS public.naver_trends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword      TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'blog_search'
               CHECK (source IN ('blog_search', 'datalab')),
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS naver_trends_collected_idx
  ON public.naver_trends (collected_at DESC);

-- 유튜브 PD 콘텐츠 큐 (경쟁분석 → 스크립트 → 썸네일 → 업로드)
CREATE TABLE IF NOT EXISTS public.content_youtube_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  competitor_notes  TEXT,
  script            TEXT,
  thumbnail_concept TEXT,
  status            TEXT NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'pending_approval', 'approved', 'rejected', 'uploaded')),
  youtube_video_id  TEXT,
  reject_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS content_youtube_queue_status_idx
  ON public.content_youtube_queue (status, created_at DESC);

-- 카카오 매니저 포스트 큐 (포스트기획 → 제작 → 발행 → 성과관리)
CREATE TABLE IF NOT EXISTS public.content_kakao_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'planning'
                CHECK (status IN ('planning', 'pending_approval', 'approved', 'rejected', 'published')),
  reject_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS content_kakao_queue_status_idx
  ON public.content_kakao_queue (status, created_at DESC);

-- 유튜브 업로드용 OAuth 2.0 토큰 (대장 계정, 단일 행)
CREATE TABLE IF NOT EXISTS public.youtube_oauth_tokens (
  id            INT PRIMARY KEY DEFAULT 1,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ,
  channel_id    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_youtube_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_kakao_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_oauth_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.blog_posts IS '콘텐츠 마케팅 사령부 — dkansim.com/blog 포스트 (서버 service role 전용)';
COMMENT ON TABLE public.naver_trends IS '콘텐츠 마케팅 사령부 — 네이버 트렌드 키워드/경쟁 블로그 분석 결과 (서버 service role 전용)';
COMMENT ON TABLE public.content_youtube_queue IS '콘텐츠 마케팅 사령부 — 유튜브 PD 영상 기획/승인/업로드 큐 (서버 service role 전용)';
COMMENT ON TABLE public.content_kakao_queue IS '콘텐츠 마케팅 사령부 — 카카오 매니저 포스트 기획/승인/발행 큐 (서버 service role 전용)';
COMMENT ON TABLE public.youtube_oauth_tokens IS '콘텐츠 마케팅 사령부 — 유튜브 업로드용 OAuth 2.0 토큰 (서버 service role 전용)';

-- 025: 유튜브 인사이트 파이프라인 테이블 + HQ 보고서 승인 컬럼
CREATE TABLE IF NOT EXISTS public.youtube_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   TEXT NOT NULL UNIQUE,
  channel_name TEXT NOT NULL,
  url          TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.youtube_videos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
  video_id     TEXT NOT NULL UNIQUE,
  title        TEXT,
  published_at TIMESTAMPTZ,
  transcript   TEXT,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS youtube_videos_channel_idx
  ON public.youtube_videos (channel_id);

CREATE TABLE IF NOT EXISTS public.youtube_insights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id   UUID NOT NULL REFERENCES public.youtube_videos(id) ON DELETE CASCADE,
  summary    TEXT,
  insights   JSONB NOT NULL DEFAULT '{}'::jsonb,
  model      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS youtube_insights_video_idx
  ON public.youtube_insights (video_id);

CREATE TABLE IF NOT EXISTS public.agent_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level      TEXT NOT NULL DEFAULT 'info'
             CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source     TEXT NOT NULL,
  message    TEXT NOT NULL,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS agent_logs_created_idx
  ON public.agent_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.pipeline_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'started'
              CHECK (status IN ('started', 'success', 'failed')),
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pipeline_logs_pipeline_idx
  ON public.pipeline_logs (pipeline, started_at DESC);

ALTER TABLE public.agent_reports
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.youtube_channels IS '유튜브 인사이트 파이프라인 — 수집 대상 채널 (서버 service role 전용)';
COMMENT ON TABLE public.youtube_videos IS '유튜브 인사이트 파이프라인 — 수집된 영상/자막 (서버 service role 전용)';
COMMENT ON TABLE public.youtube_insights IS '유튜브 인사이트 파이프라인 — Gemini 분석 결과 (서버 service role 전용)';
COMMENT ON TABLE public.agent_logs IS 'AI 에이전트 실행 로그 (서버 service role 전용)';
COMMENT ON TABLE public.pipeline_logs IS '자동화 파이프라인 실행 이력 (서버 service role 전용)';

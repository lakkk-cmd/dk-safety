-- 유튜브 채널 분석 에이전트: 채널 패턴 분석 + 콘텐츠 제안

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('전기안전', '자격시험', '실무'));

CREATE TABLE IF NOT EXISTS public.youtube_channel_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      TEXT NOT NULL,
  channel_name    TEXT,
  channel_url     TEXT,
  videos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  pattern_summary TEXT NOT NULL DEFAULT '',
  proposals       JSONB NOT NULL DEFAULT '[]'::jsonb,
  queue_ids       UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS youtube_channel_analyses_created_idx
  ON public.youtube_channel_analyses (created_at DESC);

ALTER TABLE public.youtube_channel_analyses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.youtube_channel_analyses IS '유튜브 채널 분석 에이전트 — 채널 패턴 분석 + 콘텐츠 제안 기록 (서버 service role 전용)';

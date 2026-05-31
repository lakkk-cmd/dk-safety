-- 023: AI 경영진 사령부 — 기억·보고·대장 피드백
CREATE TABLE IF NOT EXISTS public.agent_memory (
  key        TEXT PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_label       TEXT NOT NULL,
  chief_summary    TEXT,
  sections         JSONB NOT NULL DEFAULT '[]'::jsonb,
  feedback_applied TEXT
);

CREATE INDEX IF NOT EXISTS agent_reports_created_idx
  ON public.agent_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS public.boss_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'applied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS boss_feedback_pending_idx
  ON public.boss_feedback (created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_feedback ENABLE ROW LEVEL SECURITY;

-- 서버(service role) 전용. anon/authenticated 직접 접근 없음.

COMMENT ON TABLE public.agent_memory IS 'AI 경영진 누적 기억 (shared_memory, structured_v1 등)';
COMMENT ON TABLE public.agent_reports IS '일일/회의 보고서 아카이브';
COMMENT ON TABLE public.boss_feedback IS '대장 피드백 — pending 시 다음 Cron에 반영';

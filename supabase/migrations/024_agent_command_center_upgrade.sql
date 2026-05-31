-- 024: 기존 agent_reports(구스키마) → 총괄·피드백 컬럼, boss_feedback 테이블
ALTER TABLE public.agent_reports
  ADD COLUMN IF NOT EXISTS chief_summary TEXT,
  ADD COLUMN IF NOT EXISTS feedback_applied TEXT;

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

ALTER TABLE public.boss_feedback ENABLE ROW LEVEL SECURITY;

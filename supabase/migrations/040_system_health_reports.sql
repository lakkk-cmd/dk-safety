-- Full 에이전트 주간 자가점검 리포트
CREATE TABLE IF NOT EXISTS public.system_health_reports (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  summary            TEXT         NOT NULL,
  findings           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  delegation_prompts JSONB        NOT NULL DEFAULT '[]'::jsonb,
  acknowledged       BOOLEAN      NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS system_health_reports_created_idx
  ON public.system_health_reports (created_at DESC);

ALTER TABLE public.system_health_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.system_health_reports IS 'Full 에이전트 주간 자가점검 리포트 (서비스 role 전용)';

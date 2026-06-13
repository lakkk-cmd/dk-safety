-- 027: hq.dkansim.com 개선 요청 시스템 — improvement_requests 테이블

CREATE TABLE IF NOT EXISTS public.improvement_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                TEXT NOT NULL DEFAULT 'other'
                      CHECK (type IN ('feature', 'bug', 'ui', 'other')),
  content             TEXT NOT NULL,
  screenshot_url      TEXT,
  ai_title            TEXT,
  ai_analysis         TEXT,
  status              TEXT NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received', 'analyzing', 'issue_created', 'in_progress', 'completed', 'failed')),
  github_issue_url    TEXT,
  github_issue_number INT,
  github_pr_url       TEXT,
  error_message       TEXT,
  acknowledged        BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS improvement_requests_status_idx
  ON public.improvement_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS improvement_requests_unacked_idx
  ON public.improvement_requests (acknowledged, created_at DESC)
  WHERE acknowledged = false;

ALTER TABLE public.improvement_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.improvement_requests IS 'hq.dkansim.com 개선 요청 — AI 분석/GitHub Issue/PR 자동화 파이프라인 (서버 service role 전용)';

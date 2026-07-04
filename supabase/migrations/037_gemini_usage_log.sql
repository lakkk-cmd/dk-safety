-- Gemini API(Veo 3.1) 비용 추적 로그

CREATE TABLE IF NOT EXISTS public.gemini_usage_log (
  id          BIGSERIAL    PRIMARY KEY,
  model       TEXT         NOT NULL,
  operation   TEXT         NOT NULL,  -- 'veo_video' | 'veo_video_fallback'
  queue_id    TEXT,
  scene_index INT,
  cost_usd    NUMERIC(10, 4) NOT NULL DEFAULT 0,
  success     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.gemini_usage_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='gemini_usage_log'
      AND policyname='Service role full access'
  ) THEN
    CREATE POLICY "Service role full access" ON public.gemini_usage_log
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE  public.gemini_usage_log IS 'Gemini API(Veo 3.1) 호출 비용 로그';
COMMENT ON COLUMN public.gemini_usage_log.operation IS 'veo_video | veo_video_fallback';

-- 일별 집계 뷰 (HQ 대시보드용)
CREATE OR REPLACE VIEW public.gemini_usage_summary AS
SELECT
  DATE_TRUNC('day', created_at AT TIME ZONE 'Asia/Seoul') AS day_kst,
  operation,
  COUNT(*)                          AS call_count,
  SUM(cost_usd)                     AS total_cost_usd,
  ROUND(SUM(cost_usd) * 1350)       AS total_cost_krw
FROM public.gemini_usage_log
WHERE success = TRUE
GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'Asia/Seoul'), operation
ORDER BY day_kst DESC;

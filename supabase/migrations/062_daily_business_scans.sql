-- 매일 아침 이상신호+성장기회 스캔 결과 저장 (하이브리드: 카톡 알림 + hq 홈 카드에서 조회)
CREATE TABLE IF NOT EXISTS public.daily_business_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS daily_business_scans_created_at_idx
  ON public.daily_business_scans (created_at DESC);

ALTER TABLE public.daily_business_scans ENABLE ROW LEVEL SECURITY;

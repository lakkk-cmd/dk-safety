-- AI 소견 생성 결과 저장 (임대인용/거주자용)
ALTER TABLE public.field_reports
  ADD COLUMN IF NOT EXISTS opinion_landlord TEXT,
  ADD COLUMN IF NOT EXISTS opinion_resident TEXT,
  ADD COLUMN IF NOT EXISTS opinion_generated_at TIMESTAMPTZ;

ALTER TABLE public.field_reports DROP CONSTRAINT IF EXISTS field_reports_status_check;
ALTER TABLE public.field_reports
  ADD CONSTRAINT field_reports_status_check CHECK (status IN ('draft', 'submitted', 'opinion_generated'));

COMMENT ON COLUMN public.field_reports.opinion_landlord IS 'KEC 조항 근거를 포함한 임대인(집주인)용 전문 소견';
COMMENT ON COLUMN public.field_reports.opinion_resident IS '비전문가 친화적인 거주자(세입자)용 소견';

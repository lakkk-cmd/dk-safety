-- 세대 진단 리포트 PDF URL 저장 (임대인용/거주자용)
ALTER TABLE public.field_reports
  ADD COLUMN IF NOT EXISTS pdf_landlord_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_resident_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

ALTER TABLE public.field_reports DROP CONSTRAINT IF EXISTS field_reports_status_check;
ALTER TABLE public.field_reports
  ADD CONSTRAINT field_reports_status_check
  CHECK (status IN ('draft', 'submitted', 'opinion_generated', 'pdf_generated'));

COMMENT ON COLUMN public.field_reports.pdf_landlord_url IS '임대인용 "전기안전 정밀진단 보고서" PDF (Supabase Storage)';
COMMENT ON COLUMN public.field_reports.pdf_resident_url IS '거주자용 "우리집 전기 안전 가이드" PDF (Supabase Storage)';

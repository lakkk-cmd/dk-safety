-- 진단 리포트 알림톡/SMS 발송 결과 저장 + 임대인 연락처
ALTER TABLE public.field_reports
  ADD COLUMN IF NOT EXISTS send_result JSONB,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE public.field_reports DROP CONSTRAINT IF EXISTS field_reports_status_check;
ALTER TABLE public.field_reports
  ADD CONSTRAINT field_reports_status_check
  CHECK (status IN ('draft', 'submitted', 'opinion_generated', 'pdf_generated', 'completed'));

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS landlord_phone TEXT;

COMMENT ON COLUMN public.field_reports.send_result IS '{"resident": {...}, "landlord": {...}|null} — 채널(kakao_alimtalk/sms)·성공여부·messageId/error';
COMMENT ON COLUMN public.reservations.landlord_phone IS '임대인(집주인) 연락처 — 있는 경우만 진단 리포트 PDF 발송';

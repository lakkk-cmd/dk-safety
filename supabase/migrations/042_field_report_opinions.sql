-- AI 소견 생성 결과 저장 (임대인용/거주자용)
ALTER TABLE public.field_reports
  ADD COLUMN IF NOT EXISTS opinion_landlord TEXT,
  ADD COLUMN IF NOT EXISTS opinion_resident TEXT,
  ADD COLUMN IF NOT EXISTS opinion_generated_at TIMESTAMPTZ;

-- 이 파일은 npm run db:apply가 전체 마이그레이션을 매번 처음부터 재생하는 방식이라 매번 다시
-- 실행된다. 043/044가 나중에 이 제약을 더 넓게 다시 교체하므로, 여기서 당시 값('opinion_generated'까지)만
-- 허용하면 그 사이에 실제 운영 데이터가 'pdf_generated'/'completed'까지 쌓인 뒤에는 재생 시 즉시
-- 위반된다. 최종본(044)과 동일한 값 목록을 써서 재생 안전하게 유지한다.
ALTER TABLE public.field_reports DROP CONSTRAINT IF EXISTS field_reports_status_check;
ALTER TABLE public.field_reports
  ADD CONSTRAINT field_reports_status_check
  CHECK (status IN ('draft', 'submitted', 'opinion_generated', 'pdf_generated', 'completed'));

COMMENT ON COLUMN public.field_reports.opinion_landlord IS 'KEC 조항 근거를 포함한 임대인(집주인)용 전문 소견';
COMMENT ON COLUMN public.field_reports.opinion_resident IS '비전문가 친화적인 거주자(세입자)용 소견';

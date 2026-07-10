-- API 비용(OpenRouter 등 유료 AI API 사용료)을 ERP 경비에 자동 기록하기 위한 카테고리 추가.
-- 지금까지 expenses.category에 이런 지출을 담을 칸이 없어 API 지출이 ERP 어디에도
-- 안 잡히고 있었다(운영 공백 점검 8번).

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('재료비','공구/장비','교통비','통신비','광고비','인건비','API비용','기타'));

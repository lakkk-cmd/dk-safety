-- site_decisions 테이블이 마이그레이션 파일 없이(대시보드에서 직접) 생성돼 있었고,
-- src/app/api/chat/decision/route.ts는 label 컬럼에 값을 넣으려 시도하는데 실제로는
-- 컬럼이 없어 label을 포함한 모든 apply_site_decision 호출이 500으로 실패하고 있었음.
-- (실제 재현: 이슈#27/#28 반영 시도 중 "Could not find the 'label' column" 오류로 발견)

ALTER TABLE public.site_decisions
  ADD COLUMN IF NOT EXISTS label text;

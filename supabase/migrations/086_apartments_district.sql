-- 아파트 단지 관리 화면에서 구(區)별 탭 분류/검색을 위한 컬럼.
-- 기존 단지는 값이 비어 있으므로("미분류") 관리자가 수정 화면에서 채워 넣어야 한다.
alter table if exists public.apartments
  add column if not exists district text not null default '';

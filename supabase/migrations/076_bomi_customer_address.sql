-- 고객등록 폼에 주소가 없어 지역별 필터링(대시보드)이 불가능했다. 주소 컬럼 추가.
alter table public.bomi_customers add column if not exists address text not null default '';

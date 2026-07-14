-- 주소 검색(다음 우편번호 서비스) 연동 시 우편번호를 함께 저장하기 위한 컬럼.
alter table public.bomi_customers add column if not exists postal_code text not null default '';

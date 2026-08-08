-- 무상수리 보증기간을 부품 사용 여부에 따라 2개월(미사용)/4개월(사용)로 가르기 위한
-- 판단 근거 컬럼. 작업완료 시 기사(또는 관리자, 워크인 접수 건)가 직접 체크한다.
alter table if exists public.reservations
  add column if not exists parts_used boolean not null default false;

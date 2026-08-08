-- db:apply(scripts/apply-supabase-schema.mjs)가 매번 001번부터 전체 마이그레이션을
-- 재생하던 방식을 "이미 적용된 파일은 건너뛰는" 방식으로 바꾸기 위한 원장 테이블.
--
-- 과거 재생 방식은 예: reservations_status_check 제약이 002 → 020 → 068번에 걸쳐
-- 점점 넓어지는데, 운영 데이터에 이미 '취소' 상태 행이 있는 상태로 처음부터 재생하면
-- 068번에 도달하기 전 002번 단계에서 제약 위반으로 실패해 그 뒤 파일들이 아예
-- 적용되지 못하는 문제가 있었다. 이 테이블이 생긴 뒤로는 새 마이그레이션 파일만
-- 한 번씩 적용되므로 이 문제 자체가 재발하지 않는다.
create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

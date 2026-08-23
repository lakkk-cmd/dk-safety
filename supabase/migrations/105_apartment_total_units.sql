-- 단지 총세대수 — 세대전기점검(직무고시) 처리율(점검완료 세대수/총세대수) 계산용.
alter table public.apartments
  add column if not exists total_units integer;

comment on column public.apartments.total_units is
  '단지 총세대수 — 세대전기점검 처리율 계산에 쓰인다. 미설정(null)이면 처리율을 표시하지 않는다.';

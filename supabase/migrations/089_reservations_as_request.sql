-- A/S(보증기간 내 재방문) 요청 예약을 원본 예약과 연결하기 위한 컬럼.
-- 값이 있으면 "A/S 요청" 예약이라는 뜻이며, 값은 원본(작업완료된) 예약의 id를 가리킨다.
alter table if exists public.reservations
  add column if not exists as_source_reservation_id uuid references public.reservations(id) on delete set null;

create index if not exists reservations_as_source_reservation_id_idx
  on public.reservations (as_source_reservation_id);

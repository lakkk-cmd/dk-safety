-- A/S(애프터서비스) 재방문 접수는 출장비 무료가 자동적용되어 orders.prepayment_amount가
-- 정당하게 0원이 될 수 있다(2026-08-11 정책). 기존 제약(migration 081)은 "0보다 크고
-- 상식적인 상한 이하"로 0을 막고 있어, A/S 예약 생성 시 연결된 orders 행 생성이
-- "violates check constraint orders_prepayment_amount_chk"로 실패했다(실제 e2e 테스트로
-- 발견). 0원도 정당한 값으로 허용하도록 하한만 완화한다.
alter table if exists public.orders
  drop constraint if exists orders_prepayment_amount_chk;

alter table if exists public.orders
  add constraint orders_prepayment_amount_chk
    check (prepayment_amount >= 0 and prepayment_amount <= 2000000);

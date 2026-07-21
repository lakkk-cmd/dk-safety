-- orders.prepayment_amount 체크 제약을 하드코딩된 화이트리스트(50000, 100000)에서
-- 합리적인 범위 체크로 완화한다.
--
-- 2026-07-19 "요금 단일출처화" 작업(payment_settings/pricing_catalog)으로 실제 예약금이
-- base_dispatch_fee=150,000원으로 바뀌었는데, 이 DB 제약(migration 015)은 갱신되지 않아
-- 남아 있었다. 그 결과 2026-07-20부터 "점검/수리"·"기타점검" 접수(150,000원)마다
-- POST /api/orders가 매번 "violates check constraint orders_prepayment_amount_chk"로
-- 500 실패 — 고객이 예약 접수는 됐지만 결제 단계로 전혀 넘어가지 못하는 실제 민원
-- (2026-07-20 14:07, 예약ID c43b61d2)의 직접 원인이었다.
--
-- 요금은 앞으로도 /admin/pricing에서 계속 바뀔 수 있으므로, 특정 금액을 다시 하드코딩하면
-- 같은 문제가 재발한다. 대신 "0보다 크고 상식적인 상한 이하"라는 넓은 범위만 강제한다.
alter table if exists public.orders
  drop constraint if exists orders_prepayment_amount_chk;

alter table if exists public.orders
  add constraint orders_prepayment_amount_chk
    check (prepayment_amount > 0 and prepayment_amount <= 2000000);

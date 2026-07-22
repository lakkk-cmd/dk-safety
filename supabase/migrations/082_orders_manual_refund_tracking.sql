-- 계좌이체(가상계좌) 등 Toss 자동환불이 불가능한 취소 건은 관리자가 직접 계좌로
-- 환불해야 하는데, 지금까지는 취소 처리 순간의 화면 토스트 메시지 한 번으로만
-- 안내되고 어디에도 남지 않았다 — "아직 환불 안 보낸 금액이 얼마인지" 나중에
-- 확인할 방법이 없었다(2026-07-23 금융/가상계좌 관리 화면 점검 중 발견).
--
-- orders.refund_amount는 "Toss 결제취소로 실제 환불된 금액"으로 이미 의미가
-- 고정돼 있어(migration 068 주석) 재사용하지 않고, 수동환불 전용 컬럼을 둔다.

alter table public.orders
  add column if not exists manual_refund_amount integer,
  add column if not exists manual_refund_completed_at timestamptz;

comment on column public.orders.manual_refund_amount is
  '자동환불 불가(계좌이체 등)로 관리자가 직접 계좌로 환불해야 하는 금액. manual_refund_completed_at이 비어있으면 아직 미완료.';
comment on column public.orders.manual_refund_completed_at is
  '관리자가 위 금액을 실제로 계좌 환불 완료 처리한 시각.';

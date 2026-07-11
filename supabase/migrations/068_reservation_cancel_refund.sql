-- 예약 취소/환불 기능 (1단계: 관리자 전용) 스키마 준비
--
-- orders.payment_status/dispatch_status/final_payment_status는 015/012에서 이미
-- 'CANCELLED'를 유효값으로 포함하고 있어 제약 변경이 필요 없다. reservations.status만
-- '취소'가 빠져 있어 020과 동일한 방식으로 제약을 다시 만든다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reservations_status_check'
      AND conrelid = 'public.reservations'::regclass
  ) THEN
    ALTER TABLE public.reservations DROP CONSTRAINT reservations_status_check;
  END IF;
END $$;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('waiting_payment', '접수', '진행중', '완료', 'extra_fee_confirming', '취소'));

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount INTEGER;

COMMENT ON COLUMN public.reservations.cancel_reason IS '관리자가 취소 처리 시 입력한 사유(정책상 사유 또는 강제환불 사유)';
COMMENT ON COLUMN public.orders.refund_amount IS 'Toss 결제취소로 실제 환불된 금액(원). 정책상 환불 불가로 처리된 취소는 0.';

-- 018: 현장 추가비용 확인 요청 필드 및 재요청 알림 (특허 청구항 14)

-- reservations 테이블 필드 추가
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS extra_fee_confirm_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_fee_confirm_request_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_fee_confirmed             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_fee_confirmed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_fee_confirmed_by          TEXT;

-- orders 테이블 동일 필드 추가
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS extra_fee_confirm_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_fee_confirm_request_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_fee_confirmed             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_fee_confirmed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_fee_confirmed_by          TEXT;

-- 확인 요청 이력 로그 테이블
CREATE TABLE IF NOT EXISTS public.extra_fee_confirm_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  reservation_id TEXT,
  request_seq    INTEGER NOT NULL DEFAULT 1,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at   TIMESTAMPTZ,
  confirmed_by   TEXT,
  extra_fee      INTEGER NOT NULL DEFAULT 0,
  note           TEXT
);

CREATE INDEX IF NOT EXISTS extra_fee_logs_order_idx
  ON public.extra_fee_confirm_logs(order_id);
CREATE INDEX IF NOT EXISTS extra_fee_logs_reservation_idx
  ON public.extra_fee_confirm_logs(reservation_id);

ALTER TABLE public.extra_fee_confirm_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='extra_fee_confirm_logs'
      AND policyname='extra_fee_logs_auth_read'
  ) THEN
    CREATE POLICY extra_fee_logs_auth_read
      ON public.extra_fee_confirm_logs FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON COLUMN public.reservations.extra_fee_confirm_request_count
  IS '확인 요청 발송 횟수 — 미수신 시 재요청 카운트 (특허 청구항 14)';

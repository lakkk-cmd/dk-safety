-- 현장 즉시접수(walk-in) 지원

-- 1. reservations: source 컬럼 (접수 경로)
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online';

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_source_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_source_check
  CHECK (source IN ('online', 'walk_in', 'phone'));

-- 2. reservations: completed_at (작업 완료 시각 기록)
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 3. warranties: apt_id NOT NULL 해제 (단지 없는 현장 즉시접수에서 보증서 발급 가능)
ALTER TABLE public.warranties
  ALTER COLUMN apt_id DROP NOT NULL;

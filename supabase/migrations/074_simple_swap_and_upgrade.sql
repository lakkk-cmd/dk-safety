-- 단순 기구교체 서비스 경로 + 현장 업그레이드 규칙 — 출장비/작업비/재료비 3단계 요금 체계 중
-- "단순 기구교체"(요청 2번) 부분. 점검 없이 바로 교체하는 별도 서비스 경로의 정액 공임과,
-- 현장에서 더 큰 문제가 발견돼 상/중/하 작업비 표로 넘어가는 업그레이드 사유/시각을 기록한다.
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS simple_swap_fee INTEGER NOT NULL DEFAULT 70000;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS upgrade_reason TEXT,
  ADD COLUMN IF NOT EXISTS upgraded_at TIMESTAMPTZ;

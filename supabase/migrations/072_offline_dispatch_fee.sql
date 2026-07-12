-- 출장비 채널별 차등가 — 온라인 예약(할인가)과 전화예약·현장즉시접수(정가)를 구분한다.
-- 기존 payment_settings.base_dispatch_fee는 "온라인" 의미로 그대로 유지하고, 오프라인용
-- 컬럼만 새로 추가한다(하위호환 — 기존 코드가 참조하는 컬럼명은 안 바꿈).
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS base_dispatch_fee_offline INTEGER NOT NULL DEFAULT 200000;

-- 항목별 단가표(JSON). 기본 출장비 금액은 base_dispatch_fee와 동기화합니다.
alter table public.payment_settings
  add column if not exists pricing_catalog jsonb;

comment on column public.payment_settings.pricing_catalog is '관리자 단가표 항목 배열 [{key,title,amount,detail}] — amount null 이면 변동 요금';

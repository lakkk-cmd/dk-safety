-- 누설전류(IGR) 기준값도 절연저항(102)과 같은 이유로 단지별 설정값이다 — 세대 누전차단기
-- 회로 구성에 따라 "정상"으로 볼 누설전류 값이 달라진다(2026-08 실사용 피드백).
-- 누전차단기 미설치/동작불량 항목(elb_missing_or_faulty)을 이 값으로 자동판정한다.
alter table public.apartments
  add column if not exists leakage_current_threshold_ma numeric;

comment on column public.apartments.leakage_current_threshold_ma is
  '이 단지의 누설전류(IGR) 부적합 판정 기준값(mA) — 누전차단기 미설치/동작불량 항목 자동판정용. 미설정(null)이면 자동판정하지 않고 해당없음으로 남긴다.';

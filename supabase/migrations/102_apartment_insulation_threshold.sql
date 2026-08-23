-- 절연저항(추후 IGR도) 부적합 판정 기준값은 세대 "누전차단기 회로 하나"를 기준으로 만들어진
-- 값이라, 총괄분전반처럼 여러 회로를 한번에 재는 실측값과는 안 맞는다 — 회로들이 병렬로 묶이면
-- 합성저항(1/R총 = 1/R1+...+1/Rn)이 항상 낮아지는데, 단지마다 세대당 누전차단기 회로 개수가
-- 다르므로 "정상"으로 볼 기준값도 단지마다 달라야 한다(2026-08 실사용 피드백). 전역 상수 대신
-- 단지별로 관리자가 직접 입력한다.
alter table public.apartments
  add column if not exists insulation_resistance_threshold_mohm numeric;

comment on column public.apartments.insulation_resistance_threshold_mohm is
  '이 단지의 절연저항 부적합 판정 기준값(MΩ) — 세대 누전차단기 회로 구성에 맞춰 관리자가 직접 계산해 입력. 미설정(null)이면 자동판정하지 않고 해당없음으로 남긴다.';

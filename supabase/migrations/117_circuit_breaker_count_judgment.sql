-- 절연저항/누설전류 자동판정 방식 전면 개편(2026-08-28, 대표님 결정).
--
-- 기존: 단지마다 관리자가 절연저항/누설전류 "기준값"을 직접 입력해 apartments 테이블에
-- 저장하고, 그 값을 그대로 임계값으로 썼다(102/103). 문제: 전기과장이 단지별로 다른
-- 기준값을 착각/오인지할 위험이 있고, 신규단지는 승인 시점에 관리자가 입력을 깜빡하면
-- 판정 자체가 보류("/")로 남았다.
--
-- 변경: 절연저항 0.22MΩ, 누설전류 1mA를 전국 공통 고정기준으로 삼는다. 대신 세대마다
-- 분전함 차단기 회로수가 다르므로(회로가 많을수록 절연저항은 병렬합성저항으로 낮아지고,
-- 누설전류는 회로분이 합산되어 높아짐 — 전기적으로 자연스러운 현상), 점검 시점에 전기과장이
-- 실측값과 함께 회로수를 입력하면, 서버가 "고정기준 × 회로수"(누설전류) 또는
-- "고정기준 ÷ 회로수"(절연저항)로 그 세대에 맞는 임계값을 매번 계산해서 판정한다.
-- 사람이 기준값을 기억/오인지할 여지 자체를 없앤다.

alter table public.unit_electrical_inspections
  add column if not exists circuit_breaker_count integer;

alter table public.unit_electrical_inspections
  drop constraint if exists unit_inspections_circuit_breaker_count_positive;
alter table public.unit_electrical_inspections
  add constraint unit_inspections_circuit_breaker_count_positive
  check (circuit_breaker_count is null or circuit_breaker_count >= 1);

comment on column public.unit_electrical_inspections.circuit_breaker_count is
  '세대 분전함 차단기 회로수 — 절연저항/누설전류 자동판정 임계값 계산에 쓴다(고정기준 0.22MΩ÷회로수,
   1mA×회로수). 2026-08-28 이전 발급 건은 null(재판정 없음, 원본 불변).';

-- 아파트별 수동 기준값 컬럼은 더 이상 쓰지 않으므로 완전히 제거한다(대표님 확정).
alter table public.apartments
  drop column if exists insulation_resistance_threshold_mohm;
alter table public.apartments
  drop column if exists leakage_current_threshold_ma;

-- 배경(2026-09-23): 세대전기점검표(별지 제15호)에는 원래부터 "금속제 분전반 접지저항
-- 기준치 초과" 항목이 있었지만, 지금까지 실측값 없이 전기과장이 육안으로 O/X를 수기 판단했다.
-- 절연저항/누설전류/부하전류처럼 실측값을 직접 입력받아 자동판정하도록 확장한다.
--
-- circuit_breaker_count와 달리 이 값은 세대별 회로수와 무관한 전국 공통 고정기준(KEC
-- 감전보호용 등전위본딩 공식, 접지저항 ≤ 50V/0.03A ≈ 1,666.7Ω)으로 판정하므로 이 컬럼
-- 하나만 추가하면 된다 — 판정 로직은 unit-inspection-rules.ts 참고.
alter table public.unit_electrical_inspections
  add column if not exists grounding_resistance numeric;

comment on column public.unit_electrical_inspections.grounding_resistance is
  '접지저항 실측값(Ω). "금속제 분전반 접지저항 기준치 초과" 항목을 이 값으로 자동판정한다
   (KEC 등전위본딩 공식 기준, computeGroundingResistanceThreshold() 참고). 회로수와 무관한
   단일 고정기준이라 circuit_breaker_count와 달리 세대별 보정이 필요 없다.';

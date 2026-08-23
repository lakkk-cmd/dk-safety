-- 콘센트·스위치 설치(제조)연도 — 법적 근거(별표3)는 콘센트·스위치 자체의 권장 수명연한을
-- 명시하지 않아(누전차단기/개폐기·차단기만 15년 명시), 대표님이 정한 회사 자체 기준(10년)으로
-- 별도 안내를 산출한다. 이 컬럼들은 규정 인용이 아니라 자체 정책 계산용 원자료다.
alter table public.unit_electrical_inspections
  add column if not exists outlet_install_year integer,
  add column if not exists switch_install_year integer,
  add column if not exists company_advisories jsonb not null default '[]'::jsonb;

comment on column public.unit_electrical_inspections.outlet_install_year is
  '콘센트 설치(제조) 연도 — 회사 자체 권장 교체주기(10년) 계산용, 워커가 알 때만 입력하는 선택값.';
comment on column public.unit_electrical_inspections.switch_install_year is
  '스위치 설치(제조) 연도 — 회사 자체 권장 교체주기(10년) 계산용, 워커가 알 때만 입력하는 선택값.';
comment on column public.unit_electrical_inspections.company_advisories is
  '회사 자체 기준(법적 근거 아님) 산출 결과 — 별표3 규칙엔진 auto_diagnosis와 반드시 분리해서 저장·표시한다.';

-- 배경(2026-09-09): AI 안전진단이 부하전류·누설전류 실측값을 전혀 해설하지 않는다는 지적을
-- 받고 확인해보니, unit-inspection-ai-diagnosis.ts의 프롬프트에 애초에 이 실측값들이 전달되지
-- 않고 있었다(절연저항은 부적합일 때 체크리스트 note에 우연히 섞여 들어갈 뿐, 부하전류는 판정
-- 기준 자체가 없어 어떤 경로로도 전달되지 않았음). violations/company_advisory와 별개로,
-- 실측값 자체(부하전류/누설전류/절연저항)를 항상 해설하는 새 섹션을 추가한다.
alter table public.unit_inspection_ai_diagnoses
  add column if not exists measurements jsonb not null default '[]'::jsonb;

comment on column public.unit_inspection_ai_diagnoses.measurements is
  '실측값(절연저항/누설전류/부하전류) 자체에 대한 해설: [{item, value, explanation}]. 절연저항·
   누설전류는 판정기준 대비 적합/부적합을 포함, 부하전류는 분기회로 정격용량 정보가 없어
   적합/부적합을 단정하지 않고 참고 설명만 담는다.';

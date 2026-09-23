-- 배경(2026-09-23): AI 안전진단 "권고사항"(recommendations, 2026-09-22 서비스·제품팀
-- 품질기준안에서 신설)이 Claude 응답에는 늘 포함되는데, unit_inspection_ai_diagnoses 테이블에는
-- 애초에 저장 컬럼이 없어서 저장 즉시 사라지고 있었다. 사후보정(runUnitInspectionAiDiagnosisAndCorrect)이
-- 만드는 첫 정정본은 메모리에 있는 값을 바로 써서 문제가 안 보이지만, 이후 이 테이블에서 다시
-- 읽어 PDF를 재생성하는 모든 경로(관리자 PDF 재생성/재발급)는 recommendations 없이 렌더링됐다.
alter table public.unit_inspection_ai_diagnoses
  add column if not exists recommendations jsonb not null default '[]'::jsonb;

comment on column public.unit_inspection_ai_diagnoses.recommendations is
  '종합총평과 별개의 "다음에 할 일" 짧은 권고 목록(최대 5개, 2026-09-22 신설). 회사 자체
   권장사항(company_advisory)과는 화면에서 합쳐 표시되지만 저장은 분리한다.';

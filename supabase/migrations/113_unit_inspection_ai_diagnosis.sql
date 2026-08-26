-- 세대전기점검 "AI 안전진단" 확장판 저장소.
--
-- 배경: 지금까지 AI 안전진단 박스는 별표3 규칙엔진(auto_diagnosis)이 산출한 부적합 항목만
-- 정해진 문구로 나열했다. 대표님 요청(2026-08-26)으로 다음처럼 바꾼다 — 적합 항목은
-- 뭉뚱그려 한 문단, 별표3 부적합만 개별로 이유+방치시 위험+조치를 풀어서 설명, 회사 자체
-- 권장사항(company_advisories)은 절대 부적합 개수에 섞지 않고 완전히 별도 섹션 유지.
-- 이 해설은 규칙엔진이 아니라 Claude 호출로 생성한다.
--
-- unit_electrical_inspections는 pdf_url 발급 즉시 불변(트리거, 전기안전관리법 제24조 보존
-- 요건)이고, 제출 자체가 체크리스트저장→PDF발급→알림발송까지 한 요청 안에서 동기로 끝나
-- 워커를 현장에서 기다리게 할 수 없다(대표님 결정: "사후보정형"). 그래서 AI 해설은 제출
-- 직후 Next.js `after()`로 백그라운드에서 생성해 이 별도 테이블에 저장하고, 완성되면
-- unit_inspection_pdf_corrections(107)에 새 PDF를 올려 "대표 PDF"를 조용히 교체한다 —
-- 원본 행은 여전히 손대지 않는다.
create table if not exists public.unit_inspection_ai_diagnoses (
  inspection_id uuid primary key references public.unit_electrical_inspections (id) on delete cascade,
  ok_summary text not null default '',
  -- 별표3 부적합 항목만: [{item, explanation}]
  violations jsonb not null default '[]'::jsonb,
  -- 회사 자체 권장사항(연한초과 등): [{item, explanation}] — violations와 반드시 분리
  company_advisory jsonb not null default '[]'::jsonb,
  summary text not null default '',
  generated_at timestamptz not null default now()
);

comment on table public.unit_inspection_ai_diagnoses is
  'AI 안전진단 확장판(적합 뭉뚱그림 + 부적합 개별해설 + 종합총평) — 제출 후 백그라운드 생성, 원본 unit_electrical_inspections 행과 분리 저장(원본 불변 트리거 때문).';
comment on column public.unit_inspection_ai_diagnoses.violations is
  '별표3 법정 부적합 항목만. 회사 자체 권장사항(company_advisory)과 절대 같은 목록에 섞지 않는다.';
comment on column public.unit_inspection_ai_diagnoses.company_advisory is
  '법적 부적합이 아닌 회사 자체 권장사항(콘센트·스위치 연한초과 등). violations 개수에 포함시키지 않는다.';

alter table public.unit_inspection_ai_diagnoses enable row level security;

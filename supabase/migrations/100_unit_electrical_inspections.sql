-- 공동주택 세대내 전기설비 점검기록표 (직무고시 별지 15호 커스텀)
-- 배경: 관리사무소와 협업해 대경이엔피가 세대점검을 대행하되, 처리방법 결정과
-- 서류 명의(서명)는 단지에 선임된 전기안전관리자에게 남는 구조. 자동 안전진단은
-- 별표3(정기점검 부적합 전기설비 처리방법) 규칙엔진 산출 결과를 저장한다.
--
-- inspection_type='visit' (세대방문점검): 12개 확인사항 전체 + 세대 성명·서명 필수
-- inspection_type='unvisited_simple' (세대미방문 간이점검, EPS실): 절연(누전) 2개 +
--   배선(규격미달불량전선) 첫 항목만 실측, 나머지 9개는 checklist_items에 result='N/A'로
--   채워 동일한 12항목 서식을 그대로 유지한다. 성명·서명 없음.
-- 부하전류/IGR/절연저항 실측값은 두 유형 공통(원본 별지15호 서식에 없는 추가 항목).

create table if not exists public.unit_electrical_inspections (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete restrict,
  dong text not null,
  ho text not null,

  inspection_type text not null check (inspection_type in ('visit', 'unvisited_simple')),
  inspector_worker_id uuid references public.workers (id) on delete set null,
  inspected_at timestamptz not null default now(),

  -- 12개 확인사항: [{category, risk_factors, item, result: 'O'|'X'|'/'|'N/A', note}]
  checklist_items jsonb not null default '[]'::jsonb,

  -- 실측값 (방문/미방문 공통 — 원본 별지15호 서식에 없는 dk-safety 추가 항목)
  load_current numeric,
  igr numeric,
  insulation_resistance numeric,
  etc_notes text not null default '',

  -- 별표3 규칙엔진 자동 산출: [{item, verdict, regulation, action_type, comment}]
  auto_diagnosis jsonb not null default '[]'::jsonb,

  -- 세대방문점검 전용 (미방문 간이점검은 둘 다 null)
  resident_name text,
  signature_data text,

  pdf_url text,
  created_at timestamptz not null default now(),

  constraint unit_inspections_visit_requires_signoff check (
    inspection_type = 'unvisited_simple'
    or (resident_name is not null and signature_data is not null)
  )
);

create index if not exists unit_electrical_inspections_apartment_idx
  on public.unit_electrical_inspections (apartment_id, dong, ho);
create index if not exists unit_electrical_inspections_worker_idx
  on public.unit_electrical_inspections (inspector_worker_id);

-- pdf_url이 채워진(발급 완료) 이후에는 수정·삭제를 막는다. 발급 전(draft) 단계에서는
-- 워커가 입력을 고칠 수 있어야 하고, PDF 생성 후 pdf_url을 되채워 넣는 후속 UPDATE도
-- 필요하므로 warranties(013)처럼 무조건 잠그지 않고 pdf_url 유무로 조건부 잠금한다.
create or replace function public.prevent_issued_unit_inspection_mutation()
returns trigger as $$
begin
  if old.pdf_url is not null then
    raise exception 'ISSUED_UNIT_INSPECTION_IMMUTABLE';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_unit_inspections_no_update on public.unit_electrical_inspections;
create trigger trg_unit_inspections_no_update
before update on public.unit_electrical_inspections
for each row
execute function public.prevent_issued_unit_inspection_mutation();

drop trigger if exists trg_unit_inspections_no_delete on public.unit_electrical_inspections;
create trigger trg_unit_inspections_no_delete
before delete on public.unit_electrical_inspections
for each row
execute function public.prevent_issued_unit_inspection_mutation();

alter table public.unit_electrical_inspections enable row level security;

comment on table public.unit_electrical_inspections is
  '공동주택 세대내 전기설비 점검기록표 — 직무고시 별지 15호 커스텀(부하전류/IGR/절연저항 실측값 + 단지명 추가). 전기안전관리법 제24조에 따라 4년 보존, pdf_url 발급 후 불변.';
comment on column public.unit_electrical_inspections.checklist_items is
  '12개 확인사항. 세대미방문 간이점검은 절연(누전) 2개 + 배선 첫 항목만 실측하고 나머지 9개는 result=''N/A''로 채워 동일한 서식을 유지한다.';
comment on column public.unit_electrical_inspections.auto_diagnosis is
  '「전기설비 검사 및 점검의 방법·절차 등에 관한 고시」 별표3(정기점검 부적합 전기설비 처리방법) 규칙엔진 산출 결과.';

-- 단지 전기선임자 성명 — 점검기록표 서명란/문서 명의에 자동 삽입 (계약 시 1회 등록)
alter table public.apartments
  add column if not exists electrical_safety_manager_name text;

comment on column public.apartments.electrical_safety_manager_name is
  '단지에 선임된 전기안전관리자 성명. 세대전기점검표 발급 시 담당자 서명란에 자동 삽입되며, 실제 점검은 대경이엔피가 대행하되 처리방법 결정과 문서 명의는 이 사람에게 남는다.';

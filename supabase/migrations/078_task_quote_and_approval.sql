-- 기사앱 현장방문 순서 재설계: 점검(진단) 연결 + 현장 견적(6번) + 고객 구두승인(7번) 체크포인트
-- 기존 tasks.status ('assigned'/'in_progress'/'completed') 제약과 reservations.payment_status enum은
-- 건드리지 않는다 — 전부 nullable 컬럼 추가로만 새 체크포인트를 표현해 관리자 대시보드/정산 로직에
-- 영향이 가지 않게 한다.

alter table public.tasks
  add column if not exists field_report_id uuid references public.field_reports(id) on delete set null,
  add column if not exists quote_materials jsonb,
  add column if not exists quote_labor_tier jsonb,
  add column if not exists quote_amount integer,
  add column if not exists quoted_at timestamptz,
  add column if not exists customer_approved_at timestamptz;

create index if not exists tasks_field_report_id_idx on public.tasks (field_report_id);

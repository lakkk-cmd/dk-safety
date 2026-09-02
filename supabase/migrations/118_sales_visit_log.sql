-- hq 9-11월 영업계획 현황판(.omc/plans/hq-sales-plan-dashboard-2026-09.md) — 관리사무소 방문기록.
-- "방문 관리사무소 수"는 apartment_managers.created_at으로는 가입까지 이어진 케이스만 잡히고
-- "방문했지만 가입 안 함" 케이스는 DB에 기록될 곳이 없어(2026-09-02 심층인터뷰에서 발견) 신설한다.
-- 대표님이 현장에서 핸드폰으로 입력하는 참고용 기록이며, 절대기준은 항상 reservations(예약건수)다.

create table if not exists public.sales_visit_log (
  id uuid primary key default gen_random_uuid(),
  apartment_name text not null,
  visit_date date not null default current_date,
  outcome text not null
    check (outcome in ('가입완료', '검토중', '거절')),
  memo text,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);

create index if not exists sales_visit_log_visit_date_idx
  on public.sales_visit_log (visit_date);

-- 이 저장소 다른 테이블과 동일한 패턴을 따른다: 정책(policy)을 별도로 만들지 않고 RLS만 켠다
-- (migration 112 컨벤션) — 서버 코드는 SUPABASE_SERVICE_ROLE_KEY로만 접근하고, anon/authenticated
-- 롤의 접근은 전부 차단된다.
alter table public.sales_visit_log enable row level security;

comment on table public.sales_visit_log is
  '9-11월 영업계획 방문기록 — 대표님이 현장에서 입력하는 참고용 선행지표(방문 관리사무소 수).
   절대기준(신규 B2C 예약건수)이 아니므로 이 테이블 조회 실패가 hq 홈 다른 지표에 영향을
   주면 안 된다(hq-summary.ts의 salesPlan.supplemental만 게이트).';
comment on column public.sales_visit_log.contact_phone is
  '관리사무소 담당자 개인 연락처(PII) — 서비스 role 전용, RLS로 anon 노출 차단.';

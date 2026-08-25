-- 세대전기점검 무료앱(inspect.dkansim.com) — 아파트 전기안전관리자 셀프서비스 계정
-- 배경: 지금까지는 대경이엔피 직원(workers)이 세대를 방문해 입력을 대행했지만, 무료앱은
-- 단지 소속 전기안전관리자(전기과장) 본인이 로그인해 직접 입력하는 모델이다. workers 세션과
-- 완전히 분리한다 — workers는 인건비 정산(worker_assignments)과 강하게 얽혀있고 여러 단지
-- 접근이 정상 동작이라, 전기과장을 거기 끼워넣으면 정산 데이터 노출/단지 스코프 이탈 위험이
-- 구조적으로 생긴다.

-- 단지 구분: 무료앱만 쓰는 단지(free_app) vs 실제 유상계약 단지(contract). 다른 기능(예약/과금)을
-- 게이팅하지 않는 순수 표시/필터용 차원 — 기존 단지는 전부 정식계약이므로 default로 백필된다.
alter table public.apartments
  add column if not exists partnership_type text not null default 'contract'
    check (partnership_type in ('contract', 'free_app'));

comment on column public.apartments.partnership_type is
  '정식계약 단지(contract) vs 세대전기점검 무료앱만 쓰는 단지(free_app). 예약/과금 로직을 게이팅하지
   않는 순수 표시·필터용 구분이며, 무료앱 단지가 이후 정식계약으로 전환되면 관리자가 수동으로 바꾼다.';

create table if not exists public.apartment_managers (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid references public.apartments (id) on delete restrict,

  name text not null,
  phone text not null,               -- 승인콜·SMS 발송용 연락처. 로그인 ID가 아니다.
  login_id text not null,
  password_hash text not null,       -- scrypt(salt:hash), src/lib/apt-manager-password.ts

  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  rejected_reason text,

  last_login_at timestamptz,         -- 관리자앱 "로그인 상태" 표시용
  password_reset_at timestamptz,     -- 대표가 초기화한 이력

  -- 검색해도 목록에 없는 신규 단지를 요청하는 경우 apartment_id는 null로 두고 아래 3개를 채운다.
  -- 승인 시 approve_apartment_manager_signup()이 apartments 행을 생성하고 apartment_id를 채운다.
  apartment_name_requested text,
  apartment_address_requested text,
  total_units_requested integer,

  created_at timestamptz not null default now(),

  constraint apartment_managers_apartment_source check (
    (apartment_id is not null and apartment_name_requested is null)
    or
    (apartment_id is null and apartment_name_requested is not null)
  )
);

-- 로그인 아이디는 전역 유니크(단지 무관) — 대소문자 구분 없이 충돌 방지.
create unique index if not exists apartment_managers_login_id_lower_uidx
  on public.apartment_managers (lower(login_id));

create index if not exists apartment_managers_apartment_idx
  on public.apartment_managers (apartment_id);
create index if not exists apartment_managers_approval_status_idx
  on public.apartment_managers (approval_status);

alter table public.apartment_managers enable row level security;

comment on table public.apartment_managers is
  '세대전기점검 무료앱(inspect.dkansim.com) 전용 셀프서비스 계정. workers와 완전히 분리되며,
   단지 1곳으로 하드 스코프된다. 승인은 매번 대표님의 관리사무소 전화 실존확인을 거친다.';

-- 신규 단지 요청 승인 시 apartments 행 생성과 apartment_managers 연결을 원자적으로 처리한다
-- (apply_site_decision(), migration 059와 동일한 패턴 — 수동 다단계 처리는 중간 실패 시
-- apartments만 생기고 계정은 미승인 상태로 남는 불일치를 만들 수 있다).
create or replace function public.approve_apartment_manager_signup(p_manager_id uuid)
returns void as $$
declare
  v_manager record;
  v_apartment_id uuid;
begin
  select * into v_manager from public.apartment_managers where id = p_manager_id for update;

  if v_manager.id is null then
    raise exception 'APARTMENT_MANAGER_NOT_FOUND';
  end if;

  if v_manager.apartment_id is not null then
    update public.apartment_managers
      set approval_status = 'approved', approved_at = now()
      where id = p_manager_id;
    return;
  end if;

  insert into public.apartments (name, total_units, partnership_type)
  values (v_manager.apartment_name_requested, v_manager.total_units_requested, 'free_app')
  returning id into v_apartment_id;

  update public.apartment_managers
    set apartment_id = v_apartment_id,
        approval_status = 'approved',
        approved_at = now()
    where id = p_manager_id;
end;
$$ language plpgsql;

-- unit_electrical_inspections(100) — 이 건을 입력한 주체가 대경 직원인지 전기과장 본인인지.
-- inspector_worker_id는 원래 not null 제약이 없어(on delete set null) 아래 default가 기존
-- 행(전부 dk_worker) 상태와 자동으로 일치한다 — 백필 불필요.
alter table public.unit_electrical_inspections
  add column if not exists input_actor_type text not null default 'dk_worker'
    check (input_actor_type in ('dk_worker', 'apt_manager')),
  add column if not exists apt_manager_id uuid
    references public.apartment_managers (id) on delete set null;

alter table public.unit_electrical_inspections
  drop constraint if exists unit_inspections_actor_consistency;
alter table public.unit_electrical_inspections
  add constraint unit_inspections_actor_consistency check (
    (input_actor_type = 'dk_worker'  and inspector_worker_id is not null and apt_manager_id is null)
    or
    (input_actor_type = 'apt_manager' and apt_manager_id is not null and inspector_worker_id is null)
  );

create index if not exists unit_electrical_inspections_apt_manager_idx
  on public.unit_electrical_inspections (apt_manager_id);

comment on column public.unit_electrical_inspections.input_actor_type is
  '이 점검 기록을 누가 입력했는지 — dk_worker(대경 직원) / apt_manager(전기과장 본인, 무료앱).
   정확히 하나의 FK만 채워지도록 unit_inspections_actor_consistency로 강제한다.';

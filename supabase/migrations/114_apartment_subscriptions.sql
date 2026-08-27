-- 세대전기점검 앱(inspect.dkansim.com) 구독제 전환 — 점검입력·AI판정·거주자 SMS/카카오 발송은
-- 계속 무료로 두고, 전기과장용 점검표 PDF 다운로드에만 유료 게이트를 건다.
-- 무료 한도: 가입일(free_quota_anchor_at) 기준 30일 롤링 주기당 5"건". 카운트 단위는 점검건이며,
-- 한 번 언락된 점검건의 재다운로드는 영구 무료다(apartment_pdf_downloads의 unique로 강제).

create table if not exists public.apartment_subscriptions (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null unique references public.apartments (id) on delete cascade,

  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'past_due', 'cancelled')),
  billing_method text
    check (billing_method in ('toss_auto', 'bank_transfer')),  -- 단지가 첫 선택을 하기 전까지 null

  toss_customer_key text,
  toss_billing_key text,

  current_period_end timestamptz,   -- 결제로 커버된 마감 시점(해지해도 여기까지는 계속 활성)
  next_billing_at timestamptz,      -- toss_auto 자동청구 크론이 참조하는 다음 청구 시각
  last_payment_at timestamptz,
  last_payment_status text,

  -- 무료 5건 한도의 30일 롤링 주기 기준점. 승인(=가입 완료) 시점에 한 번 정해지고, 이후 결제·해지
  -- 어떤 이벤트에도 움직이지 않는다 — 움직이면 주기를 리셋해 한도를 무한히 늘릴 수 있다.
  free_quota_anchor_at timestamptz not null default now(),

  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apartment_subscriptions_status_idx
  on public.apartment_subscriptions (status);
create index if not exists apartment_subscriptions_next_billing_idx
  on public.apartment_subscriptions (next_billing_at);

alter table public.apartment_subscriptions enable row level security;

comment on table public.apartment_subscriptions is
  '단지 1곳당 1행인 세대전기점검 앱 구독 상태. 구독료는 스냅샷하지 않고 매 청구 시점의
   apartments.total_units로 다시 계산한다(≤300세대 30,000원 / >300세대 50,000원).';
comment on column public.apartment_subscriptions.free_quota_anchor_at is
  '무료 PDF 5건/30일 롤링 주기의 기준점. 절대 갱신하지 않는다 — 갱신하면 주기 리셋으로 한도가 무력화된다.';

-- 언락 이력 겸 쿼터 카운터. (apartment_id, unit_inspection_id) unique라 같은 점검건을 몇 번
-- 다시 받아도 행이 늘지 않고, 따라서 한 번 언락된 PDF는 영구 무료가 된다.
create table if not exists public.apartment_pdf_downloads (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  unit_inspection_id uuid not null references public.unit_electrical_inspections (id) on delete cascade,
  apt_manager_id uuid references public.apartment_managers (id) on delete set null,
  downloaded_at timestamptz not null default now(),
  unique (apartment_id, unit_inspection_id)
);

create index if not exists apartment_pdf_downloads_apartment_downloaded_idx
  on public.apartment_pdf_downloads (apartment_id, downloaded_at);

alter table public.apartment_pdf_downloads enable row level security;

comment on table public.apartment_pdf_downloads is
  '전기과장이 점검표 PDF를 언락한 이력. 무료 한도 카운트의 원장이자 "이미 산 건" 목록이다.';

-- 비공개 버킷 사본 경로. pdf_url(공개 버킷, 거주민 결과페이지 /unit-inspection/[id]가 쓰는 링크)은
-- 손대지 않는다 — 거주민 접근은 계속 완전 무료·무마찰이어야 한다.
alter table public.unit_electrical_inspections
  add column if not exists pdf_private_path text;

comment on column public.unit_electrical_inspections.pdf_private_path is
  '전기과장 다운로드 전용 비공개 버킷 사본의 오브젝트 경로. 서명 URL로만 접근 가능하며,
   공개용 pdf_url과 같은 바이트다(재렌더링이 아니라 복사본).';

-- 문구 정정본에도 같은 비공개 사본을 둔다. 정정본이 있는 건의 "대표 PDF"는 정정본이므로,
-- 전기과장 다운로드 게이트도 원본이 아니라 이쪽 사본을 서명 URL로 내보내야 한다.
-- 이 테이블은 불변 대상이 아니라(오버레이용) 평범하게 upsert된다.
alter table public.unit_inspection_pdf_corrections
  add column if not exists corrected_pdf_private_path text;

comment on column public.unit_inspection_pdf_corrections.corrected_pdf_private_path is
  '정정본 PDF의 비공개 버킷 사본 경로(114). 공개 corrected_pdf_url은 거주민 결과페이지용으로 그대로 유지된다.';

-- 발급 완료 건의 불변성 트리거를 pdf_private_path 한정으로 완화한다.
-- 이유: 마이그레이션 이전에 발급된 건은 비공개 사본이 없어서, 다운로드 시점에 공개 URL의 바이트를
-- 그대로 복사해 비공개 버킷에 올린 뒤 그 경로를 되채워야 한다(lazy backfill). 원문 컬럼은 여전히
-- 전부 잠긴 상태이며(전기안전관리법 제24조 4년 보존), null → 값 방향의 pdf_private_path 단독
-- 변경만 통과시킨다. to_jsonb 비교로 "다른 컬럼이 하나라도 같이 바뀌면 거부"를 정확히 강제한다.
create or replace function public.prevent_issued_unit_inspection_mutation()
returns trigger as $$
begin
  if old.pdf_url is not null then
    if tg_op = 'UPDATE'
      and old.pdf_private_path is null
      and new.pdf_private_path is not null
      and (to_jsonb(new) - 'pdf_private_path') = (to_jsonb(old) - 'pdf_private_path')
    then
      return new;
    end if;
    raise exception 'ISSUED_UNIT_INSPECTION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

-- 승인(=가입 완료) 시점에 구독행을 만들어 free_quota_anchor_at을 고정한다. 같은 단지에 다른
-- 전기과장이 이미 승인돼 있으면 anchor를 건드리지 않는다(on conflict do nothing).
create or replace function public.approve_apartment_manager_signup(p_manager_id uuid)
returns void as $$
declare
  v_manager record;
  v_apartment_id uuid;
  v_code text;
begin
  select * into v_manager from public.apartment_managers where id = p_manager_id for update;

  if v_manager.id is null then
    raise exception 'APARTMENT_MANAGER_NOT_FOUND';
  end if;

  if v_manager.apartment_id is not null then
    update public.apartment_managers
      set approval_status = 'approved', approved_at = now()
      where id = p_manager_id;

    insert into public.apartment_subscriptions (apartment_id)
    values (v_manager.apartment_id)
    on conflict (apartment_id) do nothing;
    return;
  end if;

  v_code := 'fa-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.apartments (name, code, apt_code, apt_id, total_units, partnership_type, completion_date)
  values (
    v_manager.apartment_name_requested,
    v_code, v_code, v_code,
    v_manager.total_units_requested,
    'free_app',
    v_manager.apartment_completion_date_requested
  )
  returning id into v_apartment_id;

  update public.apartment_managers
    set apartment_id = v_apartment_id,
        apartment_name_requested = null,
        apartment_address_requested = null,
        apartment_completion_date_requested = null,
        total_units_requested = null,
        approval_status = 'approved',
        approved_at = now()
    where id = p_manager_id;

  insert into public.apartment_subscriptions (apartment_id)
  values (v_apartment_id)
  on conflict (apartment_id) do nothing;
end;
$$ language plpgsql;

-- 이미 승인된 기존 계정들에도 구독행을 백필한다(무료 한도 주기 기준점은 지금부터 시작).
insert into public.apartment_subscriptions (apartment_id)
select distinct m.apartment_id
from public.apartment_managers m
where m.approval_status = 'approved' and m.apartment_id is not null
on conflict (apartment_id) do nothing;

-- project_features 최신화 — 이 테이블의 'feature'/'pending' 카테고리는 자동 동기화 대상이 아니라
-- 손으로 갱신해야 한다(CLAUDE.md의 project_features 규칙 참고).
update public.project_features
  set description = '전기과장 셀프서비스 앱. 점검입력·AI판정·거주자 SMS/카카오 발송은 무료, 점검표 PDF 다운로드만 구독 게이트(30일당 무료 5건)',
      status = 'implemented',
      updated_at = now()
  where category = 'feature' and name = '세대전기점검 무료앱';

insert into public.project_features (category, name, description, status, path, tech_stack, note)
select * from (values
  ('feature', '세대전기점검 앱 구독제',
   'inspect.dkansim.com 전기과장 앱의 PDF 다운로드 유료화 — 30일 롤링 주기당 무료 5건(점검건 단위, 재다운로드는 영구 무료), 초과 시 구독 필요. 구독료는 단지 총세대수 기준 ≤300세대 30,000원/월, >300세대 50,000원/월',
   'implemented', '/apt-manager/subscribe', ARRAY['Next.js', 'Supabase', 'Toss Payments'],
   '점검입력/AI판정/거주자 알림 발송과 거주민 공개 결과페이지(/unit-inspection/[id])는 게이트 대상이 아니며 항상 무료다.'),
  ('feature', '점검표 PDF 서명 URL 게이트',
   '전기과장 다운로드용 PDF를 비공개 버킷 사본으로 이중 저장하고 서명 URL(5분)로만 내려준다. 공개 버킷의 거주민용 pdf_url은 그대로 유지',
   'implemented', NULL, ARRAY['Supabase Storage'], NULL),
  ('integration', 'Toss 자동결제(빌링키)',
   '단지 구독료 카드 자동결제 — requestBillingAuth로 카드 등록 후 빌링키 발급, 매일 도는 크론이 만기 도래분을 청구',
   'implemented', '/api/cron/apartment-subscription-billing', ARRAY['toss'], NULL)
) as v(category, name, description, status, path, tech_stack, note)
where not exists (
  select 1 from public.project_features pf
  where pf.category = v.category and pf.name = v.name
);

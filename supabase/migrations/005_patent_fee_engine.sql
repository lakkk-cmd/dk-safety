-- 특허 기반 가변 정산/선결제 게이트웨이 확장
-- 기존 테이블 구조를 유지하면서 특허 필수 필드를 증설한다.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------
-- apartments: 특허 필드 정렬 (기본 출장비 50,000원, apt_code 동기화)
-- -------------------------------------------------------------------
alter table if exists public.apartments
  add column if not exists apt_code text,
  add column if not exists address text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists discount_rate numeric(5,2) not null default 0.00,
  add column if not exists discount_label text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.apartments
set apt_code = code
where apt_code is null and code is not null;

alter table if exists public.apartments
  alter column apt_code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'apartments_apt_code_key'
      and conrelid = 'public.apartments'::regclass
  ) then
    alter table public.apartments add constraint apartments_apt_code_key unique (apt_code);
  end if;
end $$;

update public.apartments
set base_fee = 50000
where base_fee is null or base_fee < 50000;

-- -------------------------------------------------------------------
-- service_items: 특허 청구항 9 가변 요금 테이블
-- -------------------------------------------------------------------
create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  apt_id uuid references public.apartments(id) on delete cascade,
  service_type varchar(50) not null,
  name text not null,
  description text,
  base_fee_override integer,
  service_fee integer,
  min_fee integer,
  max_fee integer,
  unit_price integer,
  surcharge_flag boolean not null default false,
  bulk_discount_flag boolean not null default false,
  bulk_threshold integer not null default 5,
  bulk_discount_rate numeric(5,2) not null default 0,
  deductible_flag boolean not null default false,
  negotiation_flag boolean not null default false,
  required_cert text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_items_apt_id_idx on public.service_items(apt_id);
create index if not exists service_items_type_idx on public.service_items(service_type);

insert into public.service_items (
  apt_id, service_type, name, description, min_fee, max_fee, unit_price,
  deductible_flag, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, negotiation_flag, required_cert, display_order
)
values
  (null, 'VISIT', '기본 출장비', '방문 및 기본 점검', 50000, 50000, null, true,  false, false, 5, 0,  false, null,            1),
  (null, 'DIAGNOSIS', '정밀 안전진단', '분전반 점검 및 절연저항 측정', 150000, 150000, null, false, false, false, 5, 0, false, '전기안전관리자', 2),
  (null, 'LEAKAGE', '누전 점검 및 보수', '누전 추적 및 절연 보수', 300000, 999999, null, false, true,  false, 5, 0, false, '전기공사기사', 3),
  (null, 'OUTLET', '콘센트/스위치 교체', '단가 x 수량 정산', 15000, 25000, 15000, false, false, true, 5, 16.67, false, null, 4),
  (null, 'LIGHT', '전등기구 교체', '거실/방등 단순 교체', 30000, 50000, null, false, false, false, 5, 0, true, null, 5)
on conflict do nothing;

-- -------------------------------------------------------------------
-- workers: 자격 조건 매칭용 certifications 추가
-- -------------------------------------------------------------------
alter table if exists public.workers
  add column if not exists certifications text[] not null default '{}';

-- -------------------------------------------------------------------
-- reservations: 선결제 게이트웨이 + 가변 정산 + 보증서 필드
-- -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_status_type') then
    create type payment_status_type as enum (
      'PENDING','PREPAID','ASSIGNED','IN_PROGRESS','EXTRA_ADDED','CONFIRMING','CONFIRMED','SETTLED','CANCELLED'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'warranty_status_type') then
    create type warranty_status_type as enum ('PENDING','ISSUED','EXPIRED','VOIDED');
  end if;
end $$;

alter table if exists public.reservations
  add column if not exists service_item_id uuid references public.service_items(id) on delete set null,
  add column if not exists technician_id uuid references public.workers(id) on delete set null,
  add column if not exists prepayment_confirmed boolean not null default false,
  add column if not exists prepayment_confirmed_at timestamptz,
  add column if not exists prepayment_tx_id text,
  add column if not exists payment_status payment_status_type not null default 'PENDING',
  add column if not exists extra_fee_note text,
  add column if not exists extra_fee_added_at timestamptz,
  add column if not exists extra_confirmed boolean not null default false,
  add column if not exists extra_confirmed_at timestamptz,
  add column if not exists deductible_applied boolean not null default false,
  add column if not exists deductible_amount integer not null default 0,
  add column if not exists settled_at timestamptz,
  add column if not exists warranty_id uuid,
  add column if not exists warranty_status warranty_status_type not null default 'PENDING',
  add column if not exists confirm_request_count integer not null default 0,
  add column if not exists last_confirm_request_at timestamptz;

create index if not exists reservations_prepayment_confirmed_idx on public.reservations(prepayment_confirmed);
create index if not exists reservations_payment_status_idx on public.reservations(payment_status);
create index if not exists reservations_service_item_id_idx on public.reservations(service_item_id);

-- -------------------------------------------------------------------
-- warranties: 디지털 보증서 저장소
-- -------------------------------------------------------------------
create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  warranty_number text unique not null,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  apt_id uuid not null references public.apartments(id),
  technician_id uuid references public.workers(id),
  service_type varchar(50),
  service_summary text,
  warranty_months integer not null default 12,
  warranty_start date,
  warranty_end date,
  final_amount integer,
  site_photos text[],
  verify_url text,
  verify_token text not null default encode(gen_random_bytes(16), 'hex'),
  status warranty_status_type not null default 'ISSUED',
  issued_at timestamptz not null default now(),
  expired_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists warranties_reservation_id_uidx on public.warranties(reservation_id);
create index if not exists warranties_verify_token_idx on public.warranties(verify_token);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_warranty_id_fkey'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_warranty_id_fkey
      foreign key (warranty_id) references public.warranties(id) on delete set null;
  end if;
end $$;

-- -------------------------------------------------------------------
-- order_logs: 상태 변경 감사 이력
-- -------------------------------------------------------------------
create table if not exists public.order_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  status_from payment_status_type,
  status_to payment_status_type,
  actor text not null default 'SYSTEM',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_logs_reservation_id_idx on public.order_logs(reservation_id);

-- -------------------------------------------------------------------
-- updated_at 트리거
-- -------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_service_items_updated_at') then
    create trigger trg_service_items_updated_at
      before update on public.service_items
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_apartments_updated_at') then
    create trigger trg_apartments_updated_at
      before update on public.apartments
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.service_items enable row level security;
alter table public.warranties enable row level security;
alter table public.order_logs enable row level security;

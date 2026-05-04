-- Virtual account + apartment fee management schema hardening
-- Scope:
-- 1) apartments: apt_id, IBK account, per-apartment base fee
-- 2) orders: dong/ho, prepayment gateway, virtual account, dispatch assignment
-- 3) technicians: profile, location, availability
-- 4) RLS: resident/admin/technician read-write boundaries

-- ------------------------------------------------------------
-- apartments
-- ------------------------------------------------------------
alter table if exists public.apartments
  add column if not exists apt_id text,
  add column if not exists ibk_account_number text,
  add column if not exists ibk_account_holder text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_active boolean not null default true;

update public.apartments
set
  apt_id = coalesce(nullif(apt_id, ''), upper(code)),
  ibk_account_number = coalesce(nullif(ibk_account_number, ''), bank_info->>'accountNumber'),
  ibk_account_holder = coalesce(nullif(ibk_account_holder, ''), bank_info->>'accountHolder')
where true;

alter table if exists public.apartments
  alter column apt_id set not null,
  alter column base_fee set default 50000,
  alter column ibk_account_holder set default '대경안심전기';

create unique index if not exists apartments_apt_id_uidx on public.apartments (apt_id);
create index if not exists apartments_active_name_idx on public.apartments (is_active, name);

-- ------------------------------------------------------------
-- orders
-- ------------------------------------------------------------
alter table if exists public.orders
  add column if not exists apartment_id uuid references public.apartments(id) on delete set null,
  add column if not exists dong text,
  add column if not exists ho text,
  add column if not exists prepayment_confirmed boolean not null default false,
  add column if not exists prepayment_amount integer not null default 50000,
  add column if not exists assigned_technician_id uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Any UPDATE can fire trg_sync_order_payment_dispatch (re-apply). Drop checks first so
-- legacy IDLE/ACTIVE from 009a are not violated before we normalize to BLOCKED/READY/...
alter table if exists public.orders drop constraint if exists orders_payment_status_chk;
alter table if exists public.orders drop constraint if exists orders_dispatch_status_chk;
alter table if exists public.orders drop constraint if exists orders_prepayment_amount_chk;
alter table if exists public.orders drop constraint if exists orders_assigned_technician_fk;

update public.orders
set apartment_id = coalesce(apartment_id, apt_id)
where apartment_id is null
  and apt_id is not null;

update public.orders
set
  dong = coalesce(
    nullif(dong, ''),
    nullif(resident_info->>'dong', ''),
    nullif(split_part(resident_info->>'address', ' ', 1), '')
  ),
  ho = coalesce(
    nullif(ho, ''),
    nullif(resident_info->>'ho', ''),
    nullif(split_part(resident_info->>'address', ' ', 2), '')
  )
where true;

update public.orders
set
  dong = coalesce(nullif(dong, ''), '미입력'),
  ho = coalesce(nullif(ho, ''), '미입력')
where dong is null
   or ho is null
   or dong = ''
   or ho = '';

-- 단지 FK 없는 주문: apt_id로 보정 후에도 없으면 삭제 (스키마 NOT NULL 충족)
update public.orders
set apartment_id = apt_id
where apartment_id is null
  and apt_id is not null;

delete from public.orders where apartment_id is null;

alter table if exists public.orders
  alter column apartment_id set not null,
  alter column dong set not null,
  alter column ho set not null;

-- Normalize legacy states before adding strict checks (constraints already dropped above).
update public.orders
set payment_status = case
  when upper(coalesce(payment_status, '')) in ('PAID', 'SETTLED', 'CONFIRMED', 'PREPAID') then 'PAID'
  when upper(coalesce(payment_status, '')) in ('WAITING_FOR_DEPOSIT', 'PENDING', 'FAILED', 'CANCELLED') then upper(payment_status)
  else 'PENDING'
end;

update public.orders
set dispatch_status = case
  when upper(coalesce(dispatch_status, '')) in ('ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'READY', 'BLOCKED') then upper(dispatch_status)
  when upper(coalesce(dispatch_status, '')) = 'ACTIVE' then 'READY'
  when upper(coalesce(dispatch_status, '')) = 'IDLE' then 'BLOCKED'
  else 'BLOCKED'
end;

update public.orders
set prepayment_amount = 50000
where prepayment_amount is null or prepayment_amount not in (50000, 100000);

update public.orders
set payment_status = 'PENDING'
where payment_status is null
   or trim(payment_status::text) = ''
   or upper(trim(payment_status::text)) not in ('PENDING', 'WAITING_FOR_DEPOSIT', 'PAID', 'FAILED', 'CANCELLED');

update public.orders
set dispatch_status = 'BLOCKED'
where dispatch_status is null
   or trim(dispatch_status::text) = ''
   or upper(trim(dispatch_status::text)) not in ('BLOCKED', 'READY', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- Drop legacy constraints so we can widen state machine
-- (already dropped above)

alter table if exists public.orders
  add constraint orders_payment_status_chk
    check (payment_status in ('PENDING', 'WAITING_FOR_DEPOSIT', 'PAID', 'FAILED', 'CANCELLED'));

alter table if exists public.orders
  add constraint orders_dispatch_status_chk
    check (dispatch_status in ('BLOCKED', 'READY', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED'));

alter table if exists public.orders
  add constraint orders_prepayment_amount_chk
    check (prepayment_amount in (50000, 100000));

create index if not exists orders_apartment_id_idx on public.orders (apartment_id, created_at desc);
create index if not exists orders_dong_ho_idx on public.orders (dong, ho);
create index if not exists orders_payment_dispatch_idx on public.orders (payment_status, dispatch_status);
create index if not exists orders_assigned_technician_idx on public.orders (assigned_technician_id);

-- ------------------------------------------------------------
-- technicians
-- ------------------------------------------------------------
create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  tech_code text not null unique,
  name text not null,
  phone text,
  current_lat numeric(10, 7),
  current_lng numeric(10, 7),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technicians_available_idx on public.technicians (is_available);
create index if not exists technicians_location_idx on public.technicians (current_lat, current_lng);

alter table if exists public.orders
  add constraint orders_assigned_technician_fk
    foreign key (assigned_technician_id)
    references public.technicians(id)
    on delete set null
    deferrable initially deferred;

-- ------------------------------------------------------------
-- Trigger helpers
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_apartments_touch_updated_at on public.apartments;
create trigger trg_apartments_touch_updated_at
before update on public.apartments
for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_touch_updated_at on public.orders;
create trigger trg_orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists trg_technicians_touch_updated_at on public.technicians;
create trigger trg_technicians_touch_updated_at
before update on public.technicians
for each row execute function public.touch_updated_at();

create or replace function public.sync_order_payment_dispatch()
returns trigger
language plpgsql
as $$
begin
  if new.payment_status = 'PAID' then
    new.prepayment_confirmed := true;
    new.paid_at := coalesce(new.paid_at, now());
    if new.dispatch_status = 'BLOCKED' then
      new.dispatch_status := 'READY';
    end if;
  elsif new.prepayment_confirmed = false and new.dispatch_status <> 'CANCELLED' then
    new.dispatch_status := 'BLOCKED';
  end if;

  if new.virtual_account_amount is null then
    new.virtual_account_amount := new.prepayment_amount;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_order_payment_dispatch on public.orders;
create trigger trg_sync_order_payment_dispatch
before insert or update on public.orders
for each row execute function public.sync_order_payment_dispatch();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table if exists public.apartments enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.technicians enable row level security;

-- apartments: residents can read active apartments, authenticated users can read all
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'apartments' and policyname = 'apartments_public_read_active'
  ) then
    create policy apartments_public_read_active
      on public.apartments
      for select
      to anon, authenticated
      using (is_active = true);
  end if;
end $$;

-- orders: authenticated users can read. anon can create service request only.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_authenticated_read'
  ) then
    create policy orders_authenticated_read
      on public.orders
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_anon_insert'
  ) then
    create policy orders_anon_insert
      on public.orders
      for insert
      to anon
      with check (dispatch_status = 'BLOCKED');
  end if;
end $$;

-- technicians: authenticated read; technician can update own location/availability
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_authenticated_read'
  ) then
    create policy technicians_authenticated_read
      on public.technicians
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_self_update'
  ) then
    create policy technicians_self_update
      on public.technicians
      for update
      to authenticated
      using (auth.uid() = auth_user_id)
      with check (auth.uid() = auth_user_id);
  end if;
end $$;

grant select on public.apartments to anon, authenticated;
grant select on public.orders to authenticated;
grant insert on public.orders to anon;
grant select on public.technicians to authenticated;

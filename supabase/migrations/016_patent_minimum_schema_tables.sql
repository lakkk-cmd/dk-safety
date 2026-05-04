-- Patent minimum schema alignment for requested tables:
-- apartments, orders, warranties
-- This migration is additive/safe for existing production data.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- apartments
-- required: id, name, apt_code, base_fee, bank_account
-- ------------------------------------------------------------
create table if not exists public.apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  apt_code text not null unique,
  base_fee integer not null default 50000,
  bank_account text not null default '',
  created_at timestamptz not null default now()
);

alter table if exists public.apartments
  add column if not exists apt_code text,
  add column if not exists bank_account text;

update public.apartments
set apt_code = coalesce(nullif(apt_code, ''), nullif(code, ''), nullif(apt_id, ''), id::text)
where apt_code is null or apt_code = '';

update public.apartments
set bank_account = coalesce(
  nullif(bank_account, ''),
  nullif(ibk_account_number, ''),
  nullif(bank_info->>'accountNumber', ''),
  ''
)
where bank_account is null or bank_account = '';

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

-- ------------------------------------------------------------
-- orders
-- required: id, apt_id(FK), unit_number, payment_status, virtual_account, dispatch_status
-- ------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  apt_id uuid references public.apartments(id) on delete set null,
  unit_number text not null default '',
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID')),
  virtual_account text,
  dispatch_status text not null default 'BLOCKED',
  created_at timestamptz not null default now()
);

alter table if exists public.orders
  add column if not exists unit_number text,
  add column if not exists virtual_account text;

update public.orders
set unit_number = coalesce(
  nullif(unit_number, ''),
  case
    when coalesce(nullif(dong, ''), '') <> '' or coalesce(nullif(ho, ''), '') <> ''
      then trim(concat(coalesce(dong, ''), '-', coalesce(ho, '')))
    else null
  end,
  case
    when resident_info ? 'dong' or resident_info ? 'ho'
      then trim(concat(coalesce(resident_info->>'dong', ''), '-', coalesce(resident_info->>'ho', '')))
    else null
  end,
  '미입력'
)
where unit_number is null or unit_number = '';

update public.orders
set virtual_account = coalesce(
  nullif(virtual_account, ''),
  nullif(virtual_account_number, '')
)
where virtual_account is null or virtual_account = '';

create index if not exists orders_unit_number_idx on public.orders(unit_number);

-- ------------------------------------------------------------
-- warranties
-- required: id, order_id(FK), warranty_no, issue_date, expiry_date
-- ------------------------------------------------------------
create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  warranty_no text not null unique,
  issue_date date not null default current_date,
  expiry_date date not null default (current_date + interval '1 year'),
  created_at timestamptz not null default now()
);

alter table if exists public.warranties
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists warranty_no text,
  add column if not exists issue_date date,
  add column if not exists expiry_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'warranties_warranty_no_key'
      and conrelid = 'public.warranties'::regclass
  ) then
    alter table public.warranties add constraint warranties_warranty_no_key unique (warranty_no);
  end if;
end $$;

create index if not exists warranties_order_id_idx on public.warranties(order_id);

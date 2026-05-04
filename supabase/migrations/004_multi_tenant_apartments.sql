-- 멀티 테넌트 아파트 관리

create table if not exists public.apartments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  logo_url text,
  bank_info jsonb not null default '{"bankName":"국민은행","accountNumber":"","accountHolder":""}'::jsonb,
  base_fee integer not null default 50000,
  created_at timestamptz not null default now()
);

create unique index if not exists apartments_code_lower_uidx on public.apartments (lower(code));

alter table if exists public.reservations
  add column if not exists apartment_id uuid references public.apartments(id) on delete set null;

create index if not exists reservations_apartment_id_idx on public.reservations (apartment_id);

alter table public.apartments enable row level security;

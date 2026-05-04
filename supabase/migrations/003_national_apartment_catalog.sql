-- 전국 아파트 추천 카탈로그(자동완성용)

create table if not exists public.national_apartment_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  address_type text not null check (address_type in ('road', 'jibun')),
  created_at timestamptz not null default now()
);

create index if not exists national_apartment_catalog_name_idx
  on public.national_apartment_catalog (name);

create unique index if not exists national_apartment_catalog_name_address_type_uidx
  on public.national_apartment_catalog (lower(name), lower(address), address_type);

alter table public.national_apartment_catalog enable row level security;

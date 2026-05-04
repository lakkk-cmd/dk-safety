-- 대경안심전기: 예약 / 기사 / 작업 테이블 (Supabase SQL Editor 또는 CLI로 적용)
-- 적용 후 Dashboard → Database → Replication 에서 reservations, tasks 실시간 사용 시 Publication 추가 가능

create extension if not exists "pgcrypto";

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists workers_phone_lower_idx on public.workers (lower(trim(phone)));

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  address text not null,
  service_type text not null,
  preferred_date text not null,
  preferred_time text not null default '',
  detail text not null default '',
  image_urls jsonb not null default '[]'::jsonb,
  priority text not null default 'normal' check (priority in ('normal', 'emergency')),
  status text not null default '접수' check (status in ('접수', '진행중', '완료')),
  note text not null default '',
  note_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  worker_id uuid references public.workers (id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  site_photo_urls jsonb not null default '[]'::jsonb,
  signature_png text,
  updated_at timestamptz not null default now(),
  constraint tasks_reservation_id_key unique (reservation_id)
);

create index if not exists tasks_worker_id_idx on public.tasks (worker_id);

-- anon 직접 접근은 막고, Next.js API(서비스 롤)만 사용합니다.
alter table public.workers enable row level security;
alter table public.reservations enable row level security;
alter table public.tasks enable row level security;

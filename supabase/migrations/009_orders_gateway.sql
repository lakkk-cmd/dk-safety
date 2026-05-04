-- 대경안심전기 핵심 결제 테이블 구조 (gemini-code-1777646951601.sql 기반)
-- 기존 프로젝트 스키마와 타입 정합성을 위해 apt_id는 uuid로 정의.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  apt_id uuid references public.apartments(id) on delete set null,
  resident_info jsonb not null default '{}'::jsonb,
  base_fee integer not null default 50000,
  extra_fee integer not null default 0,
  payment_status text not null default 'PENDING',
  dispatch_status text not null default 'IDLE',
  warranty_id text unique,
  created_at timestamptz not null default now(),
  constraint orders_payment_status_chk check (payment_status in ('PENDING', 'PAID')),
  constraint orders_dispatch_status_chk check (dispatch_status in ('IDLE', 'ACTIVE'))
);

create index if not exists orders_apt_id_idx on public.orders (apt_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_authenticated_read'
  ) then
    create policy orders_authenticated_read
      on public.orders
      for select
      to authenticated
      using (true);
  end if;
end $$;

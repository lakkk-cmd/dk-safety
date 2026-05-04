-- 결제 관리 / 정산 자동화 확장

alter table if exists public.reservations
  add column if not exists base_fee integer not null default 50000,
  add column if not exists extra_fee integer not null default 0,
  add column if not exists total_amount integer not null default 50000,
  add column if not exists is_paid boolean not null default false,
  add column if not exists paid_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'reservations_status_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations drop constraint reservations_status_check;
  end if;
end $$;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('waiting_payment', '접수', '진행중', '완료'));

create table if not exists public.payment_settings (
  id integer primary key,
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  base_dispatch_fee integer not null default 50000,
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (id, bank_name, account_number, account_holder, base_dispatch_fee)
values (1, '국민은행', '123-456-789', '대경안심전기', 50000)
on conflict (id) do nothing;

alter table public.payment_settings enable row level security;


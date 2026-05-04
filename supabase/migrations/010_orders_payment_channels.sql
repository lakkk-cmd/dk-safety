-- Orders payment channel extension: card(PG) / virtual-account(deposit) / webhook state sync

alter table if exists public.orders
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists pg_provider text,
  add column if not exists imp_uid text,
  add column if not exists payment_key text,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists orders_reservation_id_idx on public.orders (reservation_id);
create index if not exists orders_payment_key_idx on public.orders (payment_key);
create index if not exists orders_imp_uid_idx on public.orders (imp_uid);

alter table if exists public.orders drop constraint if exists orders_payment_status_chk;
alter table if exists public.orders
  add constraint orders_payment_status_chk
  check (payment_status in ('PENDING', 'WAITING_FOR_DEPOSIT', 'PAID', 'FAILED'));

alter table if exists public.orders drop constraint if exists orders_dispatch_status_chk;
alter table if exists public.orders
  add constraint orders_dispatch_status_chk
  check (dispatch_status in ('IDLE', 'ACTIVE'));

alter table if exists public.orders drop constraint if exists orders_active_requires_paid_chk;
alter table if exists public.orders
  add constraint orders_active_requires_paid_chk
  check (dispatch_status <> 'ACTIVE' or payment_status = 'PAID');

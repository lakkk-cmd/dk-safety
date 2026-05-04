-- Extend orders for settlement/warranty linkage (gemini-code-1777650046998.sql)

alter table if exists public.orders
  add column if not exists extra_fee_details jsonb,
  add column if not exists total_final_fee integer,
  add column if not exists final_payment_status text not null default 'PENDING',
  add column if not exists warranty_issued_at timestamptz;

create index if not exists orders_final_payment_status_idx on public.orders (final_payment_status);
create index if not exists orders_warranty_issued_at_idx on public.orders (warranty_issued_at desc);

alter table if exists public.orders drop constraint if exists orders_final_payment_status_chk;
alter table if exists public.orders
  add constraint orders_final_payment_status_chk
  check (final_payment_status in ('PENDING', 'REQUESTED', 'PAID', 'FAILED', 'CANCELLED'));

-- Virtual account issuance fields for automated bank-transfer confirmation

alter table if exists public.orders
  add column if not exists virtual_account_bank text,
  add column if not exists virtual_account_number text,
  add column if not exists virtual_account_holder text,
  add column if not exists virtual_account_due_at timestamptz,
  add column if not exists virtual_account_amount integer;

create index if not exists orders_virtual_account_number_idx on public.orders (virtual_account_number);

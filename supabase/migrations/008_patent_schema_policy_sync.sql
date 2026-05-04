-- Patent artifact sync: RLS/policy hardening for public verification flow.
-- Source alignment: daekyung_schema.sql (apartments/service_items/orders->reservations/warranties/order_logs)

alter table if exists public.service_items enable row level security;
alter table if exists public.warranties enable row level security;
alter table if exists public.order_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'service_items'
      and policyname = 'service_items_public_read'
  ) then
    create policy service_items_public_read
      on public.service_items
      for select
      to anon, authenticated
      using (is_active = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'warranties'
      and policyname = 'warranties_verify_read'
  ) then
    create policy warranties_verify_read
      on public.warranties
      for select
      to anon, authenticated
      using (status = 'ISSUED');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_logs'
      and policyname = 'order_logs_authenticated_read'
  ) then
    create policy order_logs_authenticated_read
      on public.order_logs
      for select
      to authenticated
      using (true);
  end if;
end $$;

grant select on public.service_items to anon, authenticated;
grant select on public.warranties to anon, authenticated;
grant select on public.order_logs to authenticated;

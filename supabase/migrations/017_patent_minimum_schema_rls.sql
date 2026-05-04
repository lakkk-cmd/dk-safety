-- RLS for patent minimum schema:
-- apartments, orders, warranties
-- Role convention (JWT app_metadata.role): admin | technician | resident

-- ------------------------------------------------------------
-- helper functions
-- ------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin';
$$;

create or replace function public.is_technician()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'technician';
$$;

-- ------------------------------------------------------------
-- apartments RLS
-- ------------------------------------------------------------
alter table if exists public.apartments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'apartments' and policyname = 'apartments_public_read'
  ) then
    create policy apartments_public_read
      on public.apartments
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'apartments' and policyname = 'apartments_admin_write'
  ) then
    create policy apartments_admin_write
      on public.apartments
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- ------------------------------------------------------------
-- orders RLS
-- ------------------------------------------------------------
alter table if exists public.orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_anon_insert'
  ) then
    create policy orders_anon_insert
      on public.orders
      for insert
      to anon
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_authenticated_read'
  ) then
    create policy orders_authenticated_read
      on public.orders
      for select
      to authenticated
      using (public.is_admin() or public.is_technician());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_admin_update'
  ) then
    create policy orders_admin_update
      on public.orders
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_admin_delete'
  ) then
    create policy orders_admin_delete
      on public.orders
      for delete
      to authenticated
      using (public.is_admin());
  end if;
end $$;

-- ------------------------------------------------------------
-- warranties RLS
-- ------------------------------------------------------------
alter table if exists public.warranties enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'warranties' and policyname = 'warranties_public_verify_read'
  ) then
    create policy warranties_public_verify_read
      on public.warranties
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'warranties' and policyname = 'warranties_admin_write'
  ) then
    create policy warranties_admin_write
      on public.warranties
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

grant select on public.apartments to anon, authenticated;
grant select on public.orders to authenticated;
grant insert on public.orders to anon;
grant select on public.warranties to anon, authenticated;

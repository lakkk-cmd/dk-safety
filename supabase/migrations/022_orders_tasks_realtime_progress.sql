-- 예약 진행 상태바: orders·tasks 변경을 Realtime으로 수신
-- reservations(006)와 유사: 주민 진행 UI용 anon SELECT + publication (운영 시 행 범위 정책 강화 권장)

-- tasks
alter table if exists public.tasks enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'tasks_realtime_public_read'
  ) then
    create policy tasks_realtime_public_read
      on public.tasks
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.tasks to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;

-- orders (anon은 기존 insert만 있었음 — Realtime 전달에 SELECT 필요)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_realtime_public_read'
  ) then
    create policy orders_realtime_public_read
      on public.orders
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.orders to anon;

do $$
begin
  begin
    alter publication supabase_realtime add table public.orders;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;

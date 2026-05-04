-- 사용자/관리자/기사 실시간 진행 알림

create table if not exists public.live_notifications (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('admin', 'worker', 'resident')),
  title text not null,
  message text not null,
  target_worker_id uuid references public.workers(id) on delete cascade,
  target_phone text,
  reservation_id uuid references public.reservations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists live_notifications_role_idx on public.live_notifications(role, created_at desc);
create index if not exists live_notifications_worker_idx on public.live_notifications(target_worker_id, created_at desc);
create index if not exists live_notifications_phone_idx on public.live_notifications(target_phone, created_at desc);
create index if not exists live_notifications_reservation_idx on public.live_notifications(reservation_id, created_at desc);

alter table public.live_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'live_notifications'
      and policyname = 'live_notifications_public_read'
  ) then
    create policy live_notifications_public_read
      on public.live_notifications
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.live_notifications to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.live_notifications;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;

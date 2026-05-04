-- 주민 원페이지 결제 상태 자동 전환을 위한 Realtime 구독 설정
-- 데모 환경 기준: reservations 테이블의 UPDATE 이벤트를 클라이언트가 수신 가능하도록 한다.

alter table if exists public.reservations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reservations'
      and policyname = 'reservations_realtime_public_read'
  ) then
    create policy reservations_realtime_public_read
      on public.reservations
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.reservations to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.reservations;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;

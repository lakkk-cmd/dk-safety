-- 010 전 idle/active 집합으로 맞춤. BEFORE UPDATE 트리거(015)가 다시 BLOCKED/READY로 바꾸는 것을 잠시 막습니다.
begin;
set local session_replication_role = 'replica';

alter table if exists public.orders drop constraint if exists orders_dispatch_status_chk;

update public.orders
set dispatch_status = case
  when upper(trim(coalesce(dispatch_status::text, ''))) = 'ACTIVE' then 'ACTIVE'
  else 'IDLE'
end;

set local session_replication_role = 'origin';

alter table if exists public.orders
  add constraint orders_dispatch_status_chk
  check (dispatch_status in ('IDLE', 'ACTIVE'));

commit;

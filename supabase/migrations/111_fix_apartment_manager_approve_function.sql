-- 109/110의 approve_apartment_manager_signup() 버그 수정 — 신규단지 승인 시 apartments 행을
-- 만들고 apartment_id를 채우면서도 apartment_name_requested 등 *_requested 컬럼을 안 비워서,
-- apartment_managers_apartment_source CHECK 제약(apartment_id와 *_requested는 배타적으로 하나만
-- 채워져야 함)을 자기 자신이 위반해 승인 자체가 실패했다. 실제 신규단지 승인 흐름을 로컬에서
-- 처음 끝까지 태워보고 나서야 발견(기존단지 매칭 케이스만 테스트했었음).
create or replace function public.approve_apartment_manager_signup(p_manager_id uuid)
returns void as $$
declare
  v_manager record;
  v_apartment_id uuid;
  v_code text;
begin
  select * into v_manager from public.apartment_managers where id = p_manager_id for update;

  if v_manager.id is null then
    raise exception 'APARTMENT_MANAGER_NOT_FOUND';
  end if;

  if v_manager.apartment_id is not null then
    update public.apartment_managers
      set approval_status = 'approved', approved_at = now()
      where id = p_manager_id;
    return;
  end if;

  v_code := 'fa-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.apartments (name, code, apt_code, apt_id, total_units, partnership_type, completion_date)
  values (
    v_manager.apartment_name_requested,
    v_code, v_code, v_code,
    v_manager.total_units_requested,
    'free_app',
    v_manager.apartment_completion_date_requested
  )
  returning id into v_apartment_id;

  update public.apartment_managers
    set apartment_id = v_apartment_id,
        apartment_name_requested = null,
        apartment_address_requested = null,
        apartment_completion_date_requested = null,
        total_units_requested = null,
        approval_status = 'approved',
        approved_at = now()
    where id = p_manager_id;
end;
$$ language plpgsql;

-- 신규단지 가입신청 승인 시 자기신고 세대수(total_units_requested)를 검증 없이 그대로
-- apartments.total_units에 반영하던 문제 — 구독 요금이 세대수 기준(≤300세대 3만원/월,
-- >300세대 5만원/월)으로 나뉘는데, 신청자가 세대수를 실제보다 적게 적으면 요금을 낮게
-- 받는 허점이 생긴다. 대표님이 실존확인 전화 중 세대수도 같이 확인해 관리자 승인 화면
-- 에서 바로 고칠 수 있도록 승인 함수에 선택적 override 파라미터를 추가한다.
--
-- 기존 단지(apartment_id가 이미 있는 경우)는 total_units가 /admin/apartments에서
-- 이미 관리되는 값이라 이 override 대상이 아니다 — 신규단지 생성 분기에만 적용한다.

drop function if exists public.approve_apartment_manager_signup(uuid);

create function public.approve_apartment_manager_signup(
  p_manager_id uuid,
  p_total_units_override integer default null
)
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

    insert into public.apartment_subscriptions (apartment_id)
    values (v_manager.apartment_id)
    on conflict (apartment_id) do nothing;
    return;
  end if;

  v_code := 'fa-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.apartments (name, code, apt_code, apt_id, total_units, partnership_type, completion_date)
  values (
    v_manager.apartment_name_requested,
    v_code, v_code, v_code,
    coalesce(p_total_units_override, v_manager.total_units_requested),
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

  insert into public.apartment_subscriptions (apartment_id)
  values (v_apartment_id)
  on conflict (apartment_id) do nothing;
end;
$$ language plpgsql;

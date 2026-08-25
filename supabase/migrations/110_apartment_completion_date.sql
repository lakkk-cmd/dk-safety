-- 세대전기점검 무료앱 가입신청 개편(2026-08-25) — 단지 검색을 우리 DB의 좁은 목록이 아니라
-- 다음 우편번호 검색(전국 단지 커버)으로 바꾸면서, 준공일을 새로 수집하게 됐다. 준공일은
-- 오래된 단지일수록 노후 배선 위험이 높다는 걸 가늠하는 참고값 — 법적 판정 기준은 아니고
-- 우리 자체 우선순위 판단용(회사 자체 권장사항과 같은 성격, unit-inspection-rules.ts 참고).
alter table public.apartments
  add column if not exists completion_date date;

alter table public.apartment_managers
  add column if not exists apartment_completion_date_requested date;

comment on column public.apartments.completion_date is
  '단지 준공일 — 법적 판정 기준 아님, 노후도 참고용. 세대전기점검 무료앱 가입 시 다음 우편번호
   검색 결과와 함께 전기과장이 직접 입력한다.';

-- approve_apartment_manager_signup()가 신규단지 승인 시 준공일도 함께 넣도록 갱신(109에서
-- 정의된 함수를 대체). 겸사겸사 109에서 놓쳤던 버그도 같이 고친다 — apartments.code/apt_code/
-- apt_id가 전부 NOT NULL UNIQUE(migration 005/015/016)인데 109의 INSERT가 이 컬럼들을 아예
-- 안 채워서, 신규단지 승인이 실제로 호출되면 그대로 제약 위반으로 실패했을 것(테스트가 전부
-- 기존단지 케이스만 써서 못 잡았던 버그). 자가입력 단지는 관리자가 코드를 안 정해주므로
-- gen_random_uuid() 기반으로 자동 생성한다.
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
        approval_status = 'approved',
        approved_at = now()
    where id = p_manager_id;
end;
$$ language plpgsql;

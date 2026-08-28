-- 관리사무소 영업 시연용 전용 단지(시연전용아파트) 도입 — 매번 시연 후 세대점검 기록을 지우려면
-- 지금까지는 개발자가 직접 불변성 트리거를 잠깐 끄고 DB에서 수동 삭제해야 했다(2026-08-28,
-- 301동301호 나경문 시연 기록 정리 사례). 이걸 관리자 화면에서 버튼 한 번으로 처리할 수 있게
-- partnership_type에 'demo' 값을 추가하고, DELETE 트리거가 시연전용단지에 한해서만 예외를
-- 허용하도록 한다 — 실고객 단지(contract/free_app)의 4년 법정보관 불변성은 그대로 100% 유지된다.

alter table public.apartments drop constraint if exists apartments_partnership_type_check;
alter table public.apartments
  add constraint apartments_partnership_type_check
  check (partnership_type in ('contract', 'free_app', 'demo'));

comment on column public.apartments.partnership_type is
  '정식계약 단지(contract) / 세대전기점검 무료앱만 쓰는 단지(free_app) / 영업 시연 전용 가상 단지(demo).
   demo 단지는 unit_electrical_inspections DELETE 불변성 트리거에서 예외 처리된다(관리자가 시연
   기록을 직접 지울 수 있어야 하므로) — 실고객 데이터의 4년 법정보관 의무와는 무관한 별도 트랙이다.';

create or replace function public.prevent_issued_unit_inspection_mutation()
returns trigger as $$
declare
  v_is_demo_apartment boolean;
begin
  if old.pdf_url is not null then
    if tg_op = 'UPDATE'
      and old.pdf_private_path is null
      and new.pdf_private_path is not null
      and (to_jsonb(new) - 'pdf_private_path') = (to_jsonb(old) - 'pdf_private_path')
    then
      return new;
    end if;

    if tg_op = 'DELETE' then
      select (partnership_type = 'demo') into v_is_demo_apartment
        from public.apartments where id = old.apartment_id;
      if v_is_demo_apartment then
        return old;
      end if;
    end if;

    raise exception 'ISSUED_UNIT_INSPECTION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

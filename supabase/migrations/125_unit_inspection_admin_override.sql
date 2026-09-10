-- 관리자 전용 세대전기점검표 수정/삭제 허용 (2026-09-10, 대표님 결정: "법정 보존의무보다
-- 우선하여 관리자인 나만이 유일하게 수정 및 삭제할 수 있게 해줘").
--
-- prevent_issued_unit_inspection_mutation()(100→101→114→116)은 PDF 발급 후 원본을 잠그는
-- 4년 법정보관 트리거다. 이 결정으로 그 잠금을 관리자 한정으로 우회하되, 아무 흔적 없이
-- 조용히 뚫으면 "왜 원본이 바뀌었는지" 추적할 방법이 없어지므로 — 우회 경로를 이 마이그레이션의
-- 두 RPC 함수(admin_update_unit_inspection/admin_delete_unit_inspection)로만 좁히고, 두 함수
-- 모두 변경 전 스냅샷을 unit_inspection_admin_audit_log에 남긴 뒤에만 실제 UPDATE/DELETE를
-- 수행한다. 일반 UPDATE/DELETE(워커·전기과장·다른 API 경로)는 여전히 100% 차단된다 — 트리거
-- 안에서 세션 로컬 설정(app.admin_override)이 'true'일 때만 예외를 허용하고, 이 설정은 아래
-- 두 RPC 함수 안에서만 set_config(..., true)로 켜지므로(트랜잭션 범위, 함수 밖으로 새지 않음)
-- 다른 어떤 코드 경로도 이 값을 켤 수 없다.

create table if not exists public.unit_inspection_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  action text not null check (action in ('update', 'delete')),
  before_snapshot jsonb not null,
  after_snapshot jsonb,
  performed_at timestamptz not null default now()
);

comment on table public.unit_inspection_admin_audit_log is
  '관리자가 법정보관 불변성 트리거를 우회해 세대전기점검표 원본을 수정·삭제할 때마다 남는 감사로그(2026-09-10). inspection_id는 삭제된 뒤에도 FK 없이 값만 보존 — 원본이 사라진 뒤에도 "무엇이 있었는지" 추적 가능해야 하므로.';

create or replace function public.prevent_issued_unit_inspection_mutation()
returns trigger as $$
declare
  v_is_demo_apartment boolean;
begin
  -- 관리자 전용 우회 — admin_update_unit_inspection/admin_delete_unit_inspection RPC 안에서만
  -- 트랜잭션 범위로 켜진다(2026-09-10). 감사로그는 이 트리거가 아니라 두 RPC 함수 쪽에서
  -- (실제 변경 전) 이미 기록했으므로 여기서는 통과만 시킨다.
  if coalesce(current_setting('app.admin_override', true), '') = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

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

-- 세대주/연락처/동·호 수정 — 관리자만 호출(admin API route에서 인증 확인 후 호출), 감사로그 선기록.
create or replace function public.admin_update_unit_inspection(
  p_id uuid,
  p_resident_name text,
  p_resident_phone text,
  p_dong text,
  p_ho text
)
returns public.unit_electrical_inspections as $$
declare
  v_before public.unit_electrical_inspections;
  v_after public.unit_electrical_inspections;
begin
  select * into v_before from public.unit_electrical_inspections where id = p_id;
  if not found then
    raise exception 'UNIT_INSPECTION_NOT_FOUND';
  end if;

  perform set_config('app.admin_override', 'true', true);
  update public.unit_electrical_inspections
  set resident_name = p_resident_name,
      resident_phone = p_resident_phone,
      dong = p_dong,
      ho = p_ho
  where id = p_id
  returning * into v_after;

  insert into public.unit_inspection_admin_audit_log (inspection_id, action, before_snapshot, after_snapshot)
  values (p_id, 'update', to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$$ language plpgsql security definer;

-- 점검기록 삭제 — 데모/실고객 단지 구분 없이 관리자만 호출. PDF 파일 자체(Storage) 정리는
-- 호출부(API route)가 이 함수 호출 전에 조회한 pdf_url/pdf_private_path로 별도 처리한다.
create or replace function public.admin_delete_unit_inspection(p_id uuid)
returns void as $$
declare
  v_before public.unit_electrical_inspections;
begin
  select * into v_before from public.unit_electrical_inspections where id = p_id;
  if not found then
    raise exception 'UNIT_INSPECTION_NOT_FOUND';
  end if;

  insert into public.unit_inspection_admin_audit_log (inspection_id, action, before_snapshot)
  values (p_id, 'delete', to_jsonb(v_before));

  perform set_config('app.admin_override', 'true', true);
  delete from public.unit_electrical_inspections where id = p_id;
end;
$$ language plpgsql security definer;

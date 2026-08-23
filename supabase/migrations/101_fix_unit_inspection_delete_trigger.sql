-- 100번에서 만든 prevent_issued_unit_inspection_mutation()가 DELETE 트리거에서도 `return new`를
-- 쓰고 있었다 — DELETE 트리거에는 NEW가 존재하지 않아(NULL) BEFORE DELETE가 NULL을 반환하면
-- Postgres는 "삭제를 조용히 취소"한다. 그 결과 pdf_url이 비어 있어 조건은 통과하는데도 DELETE가
-- 매번 아무 일 없이 204를 반환하며 실제로는 행이 안 지워지는 버그가 있었다(실사용 중 발견:
-- 검증용으로 만든 더미 점검 기록을 지우려 했는데 남아있었음). DELETE는 OLD를, UPDATE는 NEW를
-- 반환하도록 tg_op으로 분기한다.
create or replace function public.prevent_issued_unit_inspection_mutation()
returns trigger as $$
begin
  if old.pdf_url is not null then
    raise exception 'ISSUED_UNIT_INSPECTION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

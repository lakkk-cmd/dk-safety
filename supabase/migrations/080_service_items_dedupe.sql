-- service_items 시드 마이그레이션(005)에 unique 제약이 없어 db:apply를 반복 실행할 때마다
-- 같은 항목이 계속 재삽입되어 정상 7개가 297개까지 누적된 문제를 정리한다.
-- (2026-07-19, /admin/pricing "최종정산 계산식" 탭 신설 중 발견)

-- 1) 완전히 동일한 (service_type, name, apt_id) 그룹에서 가장 오래된 1건만 남기고 삭제
delete from public.service_items a
using public.service_items b
where a.service_type = b.service_type
  and a.name = b.name
  and coalesce(a.apt_id::text, '') = coalesce(b.apt_id::text, '')
  and (
    a.created_at > b.created_at
    or (a.created_at = b.created_at and a.id > b.id)
  );

-- 2) 재발 방지: 같은 (서비스유형, 이름, 단지) 조합은 하나만 존재하도록 강제
--    apt_id가 null(전체 단지 공통)인 행끼리도 중복을 막기 위해 coalesce로 감싼다.
create unique index if not exists service_items_unique_key
  on public.service_items (service_type, name, coalesce(apt_id, '00000000-0000-0000-0000-000000000000'::uuid));

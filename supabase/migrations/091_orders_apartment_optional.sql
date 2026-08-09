-- orders.apartment_id/apt_id의 NOT NULL 제약을 해제한다.
--
-- migration 015에서 "단지 없는 주문은 만들 수 없다"는 전제로 orders.apartment_id를
-- NOT NULL로 강제했는데, 실제로는 "현장 즉시접수"(/admin/walk-in)가 태생적으로 단지를
-- 입력받지 않는 접수 경로라서(reservations-pg.ts의 createLinkedOrderBestEffort 주석 참고,
-- 2026-07-22 김근홍 고객 건에서 처음 발견된 "구조적 공백"), 즉시접수 건은 orders 행 자체가
-- 아예 생성되지 못했다. 그 결과 고객관리(/admin/customers) 예약별 보기에서 즉시접수 건만
-- 주문·입금/배정·정산 총액 열이 전부 빈 값("—")으로 보여 일반 예약접수와 다르게 저장된
-- 것처럼 나타났다(2026-08-09 발견).
--
-- warranties.apt_id는 이미 migration 050에서 같은 이유로 NOT NULL이 해제된 전례가 있다 —
-- 여기서도 동일한 패턴을 따른다. 단지가 있는 온라인 예약 흐름은 전혀 바뀌지 않는다(계속
-- apartment_id를 채워서 저장); 이 변경은 단지 없는 접수도 order 행을 가질 수 있게 "허용"할
-- 뿐이다.
alter table if exists public.orders
  alter column apartment_id drop not null,
  alter column apt_id drop not null;

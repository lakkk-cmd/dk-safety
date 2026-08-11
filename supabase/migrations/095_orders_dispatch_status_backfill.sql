-- orders.dispatch_status 누락 버그 소급 정리(2026-08-11, 추영선 고객 건에서 발견).
--
-- 기사 배정(activateDispatch)이 결제확인 시 dispatch_status를 'READY'까지만 올리고,
-- 그 이후 이 값을 'ASSIGNED'(배정 시)·'DONE'(작업완료 시)으로 진행시키는 코드가 어디에도
-- 없어서 — 정산·보증서까지 끝난 예약도 관리자 화면(고객관리/배정관제)에는 계속
-- "배정 대기"로만 보였다. 애플리케이션 코드(pgAssignTask/pgCompleteTask)는 함께 수정됐고,
-- 이 마이그레이션은 이미 잘못 멈춰있는 기존 데이터를 일괄 보정한다.

-- 1) 예약이 이미 "완료"인데 dispatch_status가 DONE/CANCELLED가 아닌 경우 → DONE
update public.orders o
set dispatch_status = 'DONE'
from public.reservations r
where o.reservation_id = r.id
  and r.status = '완료'
  and o.dispatch_status not in ('DONE', 'CANCELLED');

-- 2) 예약이 기사 배정되어 진행중인데 dispatch_status가 아직 BLOCKED/READY인 경우 → ASSIGNED
update public.orders o
set dispatch_status = 'ASSIGNED'
from public.reservations r
where o.reservation_id = r.id
  and r.status = '진행중'
  and r.technician_id is not null
  and o.dispatch_status in ('BLOCKED', 'READY');

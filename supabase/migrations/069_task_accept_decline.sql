-- 기사 배정 수락/거절 기능
--
-- 관리자가 기사를 배정해도 기사가 그 배정을 받아들일지 결정할 방법이 없었다. tasks에
-- 수락/거절 시각·사유 컬럼을 추가하고, reservations에는 "가장 최근 거절 이력"을 남겨
-- 관리자 배정 화면에서 즉시 재배정을 유도할 수 있게 한다. 기존 status CHECK
-- ('assigned','in_progress','completed')는 그대로 두고, "배정됨" 상태를 accepted_at
-- 유무로 세분화한다(거절 시 tasks 행 자체를 삭제하는 기존 pgUnassignTask 패턴을 그대로
-- 재사용하므로 별도 'declined' status 값은 필요 없다).

alter table public.tasks
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text;

alter table public.reservations
  add column if not exists last_decline_reason text,
  add column if not exists last_declined_worker_name text,
  add column if not exists last_declined_at timestamptz;

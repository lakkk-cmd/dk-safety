-- 034: improvement_requests에 세분화된 진행 상태(reviewing/deploying) 추가
-- 채팅에서 자동구현된 이슈의 실시간 진행상황(구현 중 → 리뷰 중 → 배포 중 → 완료)을 추적하기 위함.

ALTER TABLE public.improvement_requests DROP CONSTRAINT IF EXISTS improvement_requests_status_check;

ALTER TABLE public.improvement_requests
  ADD CONSTRAINT improvement_requests_status_check
  CHECK (status IN ('received', 'analyzing', 'issue_created', 'in_progress', 'reviewing', 'deploying', 'completed', 'failed'));

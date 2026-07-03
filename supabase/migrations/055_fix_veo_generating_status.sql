-- migration 051이 content_youtube_queue_status_check 제약조건을 재정의하면서
-- migration 038에서 추가했던 'veo_generating' 값을 빠뜨렸음.
-- 그 결과 USE_VEO_VIDEO=true 환경에서 produceVideoAssets()가 status='veo_generating'으로
-- 업데이트를 시도할 때마다 DB단에서 조용히 실패(코드에서 update 에러를 체크하지 않아
-- 응답은 200 성공으로 반환되지만 실제로는 아무것도 저장되지 않음) — 영상 제작 파이프라인이
-- 전혀 진행되지 않던 근본 원인 중 하나.

ALTER TABLE public.content_youtube_queue
  DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
ALTER TABLE public.content_youtube_queue
  ADD CONSTRAINT content_youtube_queue_status_check
  CHECK (status IN (
    'planning','draft','pending','pending_approval',
    'approved','rejected','uploaded','producing','assets_ready',
    'review_required','veo_generating'
  ));

-- B안 status 체계 도입:
--   planning       → 기획중 (승인대기 카운트 미포함)
--   draft          → 승인대기 (승인대기 카운트 포함)  ← NEW
--   pending        → 최종승인대기 (승인대기 카운트 포함)  ← NEW
--   pending_approval → (기존, 하위호환 유지)
--   approved       → 승인완료

-- content_kakao_queue: draft, pending 추가
ALTER TABLE public.content_kakao_queue
  DROP CONSTRAINT IF EXISTS content_kakao_queue_status_check;

ALTER TABLE public.content_kakao_queue
  ADD CONSTRAINT content_kakao_queue_status_check
  CHECK (status IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'published'));

-- content_youtube_queue: draft, pending 추가
ALTER TABLE public.content_youtube_queue
  DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;

ALTER TABLE public.content_youtube_queue
  ADD CONSTRAINT content_youtube_queue_status_check
  CHECK (status IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready'));

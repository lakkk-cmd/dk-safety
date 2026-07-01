-- Gemini 교차검증 실패 시 저장되는 review_required 상태 추가

ALTER TABLE public.content_youtube_queue
  DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
ALTER TABLE public.content_youtube_queue
  ADD CONSTRAINT content_youtube_queue_status_check
  CHECK (status IN (
    'planning','draft','pending','pending_approval',
    'approved','rejected','uploaded','producing','assets_ready',
    'review_required'
  ));

ALTER TABLE public.content_kakao_queue
  DROP CONSTRAINT IF EXISTS content_kakao_queue_status_check;
ALTER TABLE public.content_kakao_queue
  ADD CONSTRAINT content_kakao_queue_status_check
  CHECK (status IN (
    'planning','draft','pending','pending_approval',
    'approved','rejected','published',
    'review_required'
  ));

ALTER TABLE public.blog_posts
  DROP CONSTRAINT IF EXISTS blog_posts_status_check;
ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_status_check
  CHECK (status IN (
    'draft','pending_approval','pending','published','rejected',
    'review_required'
  ));

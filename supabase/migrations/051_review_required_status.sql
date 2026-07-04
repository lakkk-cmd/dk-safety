-- Gemini 교차검증 실패 시 저장되는 review_required 상태 추가

-- content_youtube_queue: 이후 마이그레이션(055)에서 veo_generating이 추가된다. 재실행 시
-- 실제 데이터가 이미 이 시점보다 넓은 상태값(veo_generating)을 갖고 있다면 건너뛴다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.content_youtube_queue
    WHERE status NOT IN (
      'planning','draft','pending','pending_approval',
      'approved','rejected','uploaded','producing','assets_ready',
      'review_required'
    )
  ) THEN
    ALTER TABLE public.content_youtube_queue
      DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
    ALTER TABLE public.content_youtube_queue
      ADD CONSTRAINT content_youtube_queue_status_check
      CHECK (status IN (
        'planning','draft','pending','pending_approval',
        'approved','rejected','uploaded','producing','assets_ready',
        'review_required'
      ));
  END IF;
END $$;

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

-- B안 status 체계 도입:
--   planning       → 기획중 (승인대기 카운트 미포함)
--   draft          → 승인대기 (승인대기 카운트 포함)  ← NEW
--   pending        → 최종승인대기 (승인대기 카운트 포함)  ← NEW
--   pending_approval → (기존, 하위호환 유지)
--   approved       → 승인완료

-- content_kakao_queue: draft, pending 추가
-- 이후 마이그레이션(051)에서 값이 더 추가된다. 재실행 시 실제 데이터가 이미 이 시점보다
-- 넓은 상태값(예: review_required)을 갖고 있다면 이 단계는 건너뛴다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.content_kakao_queue
    WHERE status NOT IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'published')
  ) THEN
    ALTER TABLE public.content_kakao_queue
      DROP CONSTRAINT IF EXISTS content_kakao_queue_status_check;
    ALTER TABLE public.content_kakao_queue
      ADD CONSTRAINT content_kakao_queue_status_check
      CHECK (status IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'published'));
  END IF;
END $$;

-- content_youtube_queue: draft, pending 추가
-- 이후 마이그레이션(051/055)에서 값이 더 추가된다. 재실행 시 실제 데이터가 이미 이
-- 시점보다 넓은 상태값(예: review_required, veo_generating)을 갖고 있다면 건너뛴다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.content_youtube_queue
    WHERE status NOT IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready')
  ) THEN
    ALTER TABLE public.content_youtube_queue
      DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
    ALTER TABLE public.content_youtube_queue
      ADD CONSTRAINT content_youtube_queue_status_check
      CHECK (status IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready'));
  END IF;
END $$;

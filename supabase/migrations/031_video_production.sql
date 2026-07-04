-- 3단계: 영상 제작 파이프라인 (Flux 이미지 씬 + ffmpeg 합성 자산)

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_asset_url TEXT;

-- 이 제약조건은 이후 마이그레이션(038/049/051/055)에서 값이 계속 추가된다. 재실행 시
-- 실제 데이터가 이미 이 시점보다 넓은 상태값(예: veo_generating, review_required)을
-- 갖고 있다면 이 단계는 건너뛰고 이후 마이그레이션이 최종 제약조건을 적용하게 둔다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.content_youtube_queue
    WHERE status NOT IN ('planning', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready')
  ) THEN
    ALTER TABLE public.content_youtube_queue DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
    ALTER TABLE public.content_youtube_queue
      ADD CONSTRAINT content_youtube_queue_status_check
      CHECK (status IN ('planning', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready'));
  END IF;
END $$;

COMMENT ON COLUMN public.content_youtube_queue.scenes IS '영상 제작 파이프라인 — 씬별 {narration, imagePrompt, imageUrl}[]';
COMMENT ON COLUMN public.content_youtube_queue.video_asset_url IS 'ffmpeg로 합성된 최종 영상(mp4) Supabase Storage URL';

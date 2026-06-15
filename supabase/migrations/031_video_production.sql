-- 3단계: 영상 제작 파이프라인 (Flux 이미지 씬 + ffmpeg 합성 자산)

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_asset_url TEXT;

ALTER TABLE public.content_youtube_queue DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
ALTER TABLE public.content_youtube_queue
  ADD CONSTRAINT content_youtube_queue_status_check
  CHECK (status IN ('planning', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready'));

COMMENT ON COLUMN public.content_youtube_queue.scenes IS '영상 제작 파이프라인 — 씬별 {narration, imagePrompt, imageUrl}[]';
COMMENT ON COLUMN public.content_youtube_queue.video_asset_url IS 'ffmpeg로 합성된 최종 영상(mp4) Supabase Storage URL';

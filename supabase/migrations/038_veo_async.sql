-- Veo 3.1 비동기 파이프라인: LRO name 저장 + veo_generating 상태 추가

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS veo_lro_names JSONB DEFAULT NULL;

COMMENT ON COLUMN public.content_youtube_queue.veo_lro_names IS
  'Veo 비동기 생성 대기 중인 LRO 목록: [{sceneIndex, lroName, prompt}]';

-- status CHECK 확장 (veo_generating 추가)
ALTER TABLE public.content_youtube_queue
  DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;

ALTER TABLE public.content_youtube_queue
  ADD CONSTRAINT content_youtube_queue_status_check
  CHECK (status IN (
    'planning', 'pending_approval', 'approved', 'rejected', 'uploaded',
    'producing', 'veo_generating', 'assets_ready'
  ));

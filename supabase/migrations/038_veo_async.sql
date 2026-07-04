-- Veo 3.1 비동기 파이프라인: LRO name 저장 + veo_generating 상태 추가

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS veo_lro_names JSONB DEFAULT NULL;

COMMENT ON COLUMN public.content_youtube_queue.veo_lro_names IS
  'Veo 비동기 생성 대기 중인 LRO 목록: [{sceneIndex, lroName, prompt}]';

-- status CHECK 확장 (veo_generating 추가)
-- 이후 마이그레이션(049/051/055)에서 값이 더 추가된다. 재실행 시 실제 데이터가 이미 이
-- 시점보다 넓은 상태값(예: draft, review_required)을 갖고 있다면 이 단계는 건너뛴다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.content_youtube_queue
    WHERE status NOT IN (
      'planning', 'pending_approval', 'approved', 'rejected', 'uploaded',
      'producing', 'veo_generating', 'assets_ready'
    )
  ) THEN
    ALTER TABLE public.content_youtube_queue
      DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check;
    ALTER TABLE public.content_youtube_queue
      ADD CONSTRAINT content_youtube_queue_status_check
      CHECK (status IN (
        'planning', 'pending_approval', 'approved', 'rejected', 'uploaded',
        'producing', 'veo_generating', 'assets_ready'
      ));
  END IF;
END $$;

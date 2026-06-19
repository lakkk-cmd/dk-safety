-- 영상 콘티(스토리보드) 요약 저장 — Veo/Flow 프롬프트 뷰어 지원
ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS conti_summary TEXT DEFAULT NULL;

COMMENT ON COLUMN public.content_youtube_queue.conti_summary IS
  '전체 영상 콘티 요약: 감정곡선 + 5가지 영화적 장치 적용 방법 (planVideoScenes 출력)';

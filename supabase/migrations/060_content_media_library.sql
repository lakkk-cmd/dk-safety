-- 영상 파이프라인이 Flux(AI 생성)/Pexels 대신 실제 사진(현장 분전함 촬영 사진 등)과
-- 배경음악을 재사용할 수 있도록, 태그가 달린 미디어 보관함을 둔다.
-- source='field_report'는 새로 업로드하지 않고 기존 field_reports.photo_urls의 URL을
-- 그대로 참조하는 항목(중복 저장 없음), source='upload'는 관리자가 직접 올린 항목.

CREATE TABLE IF NOT EXISTS public.content_media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type text NOT NULL CHECK (media_type IN ('photo', 'music')),
  tag text NOT NULL,
  url text NOT NULL,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'field_report')),
  use_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_media_library_type_tag_idx
  ON public.content_media_library (media_type, tag);

ALTER TABLE public.content_media_library ENABLE ROW LEVEL SECURITY;

-- dk-video-factory 1단계: 비용 0원 자체 영상 제작 파이프라인 작업 큐
-- 에이전트(CMO/유튜브PD/오케스트레이터/수동)가 INSERT → 로컬 PC 워커가 폴링 처리
-- 상태 흐름: queued → scripting → rendering → pending_review → approved → uploading → published
--                                            → rejected / error
-- 승인 게이트: 워커 업로드 함수는 status='approved'인 행만 처리해야 함 (pending_review 우회 금지)

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by TEXT NOT NULL,          -- 'cmo' | 'youtube_pd' | 'orchestrator' | 'manual'
  topic TEXT NOT NULL,                 -- 영상 주제
  format TEXT NOT NULL DEFAULT 'shorts' CHECK (format IN ('shorts', 'standard')),
  script JSONB,                        -- 대본 (없으면 워커가 Claude API로 생성)
  scenes JSONB,                        -- 씬 분해 결과 (Remotion 컴포지션 ID + props)
  audio_path TEXT,                     -- TTS 결과 파일 경로
  video_path TEXT,                     -- 렌더링 결과 (Supabase Storage URL)
  validation JSONB,                    -- {"score": 0-100, "issues": []}
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'scripting', 'rendering', 'pending_review',
    'approved', 'uploading', 'published', 'rejected', 'error'
  )),
  review_note TEXT,                    -- 반려 시 대장 코멘트
  youtube_url TEXT,
  error TEXT
);

-- 워커 폴링(status 조건) + 승인 대시보드 목록 조회용
CREATE INDEX IF NOT EXISTS video_jobs_status_idx
  ON public.video_jobs (status, created_at);

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.video_jobs IS 'dk-video-factory 영상 제작 작업 큐 — 서버 service role 전용, 대장 승인(pending_review→approved) 없이 업로드 금지';

-- 렌더링 결과 mp4 저장용 'videos' 버킷 (public read — hq 승인 대시보드 미리보기 + 유튜브 업로드 소스)
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 공개 읽기 정책 (쓰기는 service role만 — 별도 정책 없음)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'videos_public_read'
  ) THEN
    CREATE POLICY videos_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'videos');
  END IF;
END $$;

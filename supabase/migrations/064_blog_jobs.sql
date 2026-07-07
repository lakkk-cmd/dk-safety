-- dk-blog-factory 1단계: 비용 0원 네이버 블로그 제작 파이프라인 작업 큐
-- 에이전트가 INSERT → 로컬 워커가 키워드 조사→원고 생성→사진 보정→썸네일 생성 후
-- pending_review로 전환하면, 대장이 hq/blog-jobs에서 "발행 패키지"를 받아
-- 네이버 에디터에 수동으로 붙여넣어 발행한다 (자동 발행은 네이버 정책 위반이라 만들지 않음 —
-- 사람 발행이 곧 승인 게이트).
-- 상태 흐름: queued → researching → drafting → processing_images → pending_review
--                                                → published / rejected / error

CREATE TABLE IF NOT EXISTS public.blog_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by TEXT NOT NULL,          -- 'cmo' | 'blog_editor' | 'orchestrator' | 'manual'
  topic TEXT NOT NULL,
  seed_keywords TEXT[],                -- 선택: 시드 키워드
  raw_image_paths TEXT[],              -- 선택: 대장이 올린 현장 사진 (Storage 경로)
  keyword_research JSONB,              -- {main, sub[], volume, competition, questions[]}
  draft JSONB,                         -- {title, sections[], tags[], meta}
  processed_images TEXT[],             -- 보정 완료 사진 Storage URL
  thumbnail_url TEXT,
  validation JSONB,                    -- {"score": 0-100, "issues": []}
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'researching', 'drafting', 'processing_images',
    'pending_review', 'published', 'rejected', 'error'
  )),
  review_note TEXT,
  published_url TEXT,
  error TEXT
);

-- 워커 폴링 + 발행 패키지 화면 목록 조회용
CREATE INDEX IF NOT EXISTS blog_jobs_status_idx
  ON public.blog_jobs (status, created_at);

ALTER TABLE public.blog_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.blog_jobs IS 'dk-blog-factory 블로그 제작 큐 — 서버 service role 전용, 발행은 반드시 사람이 수동 수행(pending_review가 승인 게이트)';

-- 보정 사진/썸네일 저장용 'blog-assets' 버킷 (public read — 발행 패키지 다운로드용)
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-assets', 'blog-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'blog_assets_public_read'
  ) THEN
    CREATE POLICY blog_assets_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'blog-assets');
  END IF;
END $$;

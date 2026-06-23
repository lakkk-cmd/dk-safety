-- PDF 자동분류 + 자동학습 파이프라인: 업로드된 PDF 단위 처리 상태 추적

CREATE TABLE IF NOT EXISTS public.knowledge_pdfs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name       TEXT         NOT NULL,
  file_path       TEXT         NOT NULL,
  category        TEXT,
  auto_category   TEXT,
  category_reason TEXT,
  confidence      NUMERIC,
  status          TEXT         NOT NULL DEFAULT 'uploading'
                  CHECK (status IN ('uploading', 'classifying', 'processing', 'completed', 'failed')),
  chunk_count     INT          NOT NULL DEFAULT 0,
  page_count      INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS knowledge_pdfs_category_idx ON public.knowledge_pdfs (category);
CREATE INDEX IF NOT EXISTS knowledge_pdfs_file_name_idx ON public.knowledge_pdfs (file_name);

ALTER TABLE public.knowledge_pdfs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.knowledge_pdfs IS '/admin/knowledge PDF 업로드 단위 처리 상태 — 청크는 knowledge_base.pdf_id로 연결';

-- knowledge_base 청크를 원본 PDF 레코드로 역추적(재학습/삭제 시 cascade 대상 식별)
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS pdf_id UUID REFERENCES public.knowledge_pdfs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS knowledge_base_pdf_id_idx ON public.knowledge_base (pdf_id);

-- 053: 신뢰 도메인 관리 + AI 생성 문서 저장

-- 신뢰 도메인 관리 테이블
CREATE TABLE IF NOT EXISTS trusted_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_trusted_domains_category ON trusted_domains(category);
CREATE INDEX IF NOT EXISTS idx_trusted_domains_active ON trusted_domains(is_active);

ALTER TABLE trusted_domains ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='trusted_domains' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON trusted_domains FOR ALL USING (true);
  END IF;
END $$;

-- 생성된 문서 관리 테이블
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('inspection_report', 'estimate', 'completion_cert', 'safety_guide', 'contract', 'proposal', 'custom')),
  content TEXT NOT NULL,
  pdf_url TEXT,
  docx_url TEXT,
  customer_name TEXT,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  session_id TEXT,
  validation_score INTEGER,
  created_by TEXT DEFAULT 'agent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_type ON generated_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_generated_documents_created ON generated_documents(created_at DESC);

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='generated_documents' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON generated_documents FOR ALL USING (true);
  END IF;
END $$;

-- 초기 신뢰 도메인 데이터
INSERT INTO trusted_domains (category, domain, name) VALUES

-- 전기법령
('전기법령', 'law.go.kr', '국가법령정보센터'),
('전기법령', 'molit.go.kr', '국토교통부'),
('전기법령', 'motie.go.kr', '산업통상자원부'),
('전기법령', 'ksc.or.kr', '한국표준협회'),

-- 전기기술
('전기기술', 'kesco.or.kr', '한국전기안전공사'),
('전기기술', 'kepco.co.kr', '한국전력'),
('전기기술', 'keea.or.kr', '한국전기기술인협회'),
('전기기술', 'keit.re.kr', '한국전기연구원'),
('전기기술', 'keri.re.kr', '한국전기연구원(KERI)'),

-- 유튜브
('유튜브', 'youtube.com', '유튜브 공식'),
('유튜브', 'support.google.com', '유튜브 고객센터'),
('유튜브', 'creators.google.com', '유튜브 크리에이터'),

-- 마케팅
('마케팅', 'searchadvisor.naver.com', '네이버 서치어드바이저'),
('마케팅', 'help.naver.com', '네이버 고객센터'),
('마케팅', 'business.kakao.com', '카카오 비즈니스'),
('마케팅', 'ads.google.com', '구글 애즈'),

-- AI자동화
('AI자동화', 'anthropic.com', 'Anthropic 공식'),
('AI자동화', 'docs.anthropic.com', 'Claude API 문서'),
('AI자동화', 'openai.com', 'OpenAI 공식'),
('AI자동화', 'supabase.com', 'Supabase 공식'),
('AI자동화', 'nextjs.org', 'Next.js 공식'),
('AI자동화', 'voyageai.com', 'Voyage AI 공식'),

-- 사업경영
('사업경영', 'nts.go.kr', '국세청'),
('사업경영', 'moel.go.kr', '고용노동부'),
('사업경영', 'bizinfo.go.kr', '창업진흥원'),
('사업경영', 'sba.seoul.kr', '서울산업진흥원'),
('사업경영', 'smba.go.kr', '중소벤처기업부'),
('사업경영', 'nhis.or.kr', '국민건강보험'),
('사업경영', 'nps.or.kr', '국민연금'),
('사업경영', 'comwel.or.kr', '근로복지공단'),

-- 기타일반
('기타일반', 'consumer.go.kr', '한국소비자원'),
('기타일반', 'kca.go.kr', '한국소비자원(KCA)')

ON CONFLICT (domain) DO NOTHING;

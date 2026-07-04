-- 054: 프로젝트 기능 현황 + Gemini 컨텍스트 캐시

-- 프로젝트 기능 현황 테이블
CREATE TABLE IF NOT EXISTS project_features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL, -- 'page' | 'api' | 'feature' | 'integration' | 'pending'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'implemented', -- 'implemented' | 'pending' | 'deprecated'
  path TEXT, -- URL 경로 또는 파일 경로 (HTTP 라우트로 노출되지 않는 기능은 NULL)
  tech_stack TEXT[], -- ['Next.js', 'Supabase', 'Voyage AI']
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_features_category ON project_features(category);
CREATE INDEX IF NOT EXISTS idx_project_features_status ON project_features(status);

ALTER TABLE project_features ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='project_features' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON project_features FOR ALL USING (true);
  END IF;
END $$;

-- 프로젝트 컨텍스트 캐시 테이블 (Gemini 호출 시 재사용)
CREATE TABLE IF NOT EXISTS project_context_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  context_type TEXT NOT NULL UNIQUE, -- 'gemini_context' | 'api_list' | 'feature_list'
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE project_context_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='project_context_cache' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON project_context_cache FOR ALL USING (true);
  END IF;
END $$;

-- 초기 프로젝트 기능 데이터 삽입
-- 코드 리뷰(2026-07-02)로 원안의 경로 오류 2건을 수정함:
--   '/api/warranty' → 실제 경로 '/api/warranties/[warrantyNumber]/pdf'로 정정
--   '/api/agent/generate-document'는 존재하지 않음(브라우저에 서버 전용 AGENT_WRITE_SECRET을
--   넘길 방법이 없어 REST 엔드포인트 대신 풀 에이전트 도구 generate_document로 구현됨) → path를
--   NULL로, category를 'feature'로 정정
-- ON CONFLICT DO NOTHING은 실제 UNIQUE 제약이 없어 무의미했다(재실행마다 중복 삽입 —
-- 057에서 정리됨). (category, name) 기준 존재 여부를 직접 확인해 진짜 멱등하게 만든다.
INSERT INTO project_features (category, name, description, status, path, tech_stack, note)
SELECT * FROM (VALUES

-- 구현된 페이지
('page', '메인 홈', '전기안전 서비스 소개 및 예약', 'implemented', '/', ARRAY['Next.js'], NULL),
('page', '예약 시스템', '전기안전 점검 예약', 'implemented', '/reservation', ARRAY['Next.js', 'Toss Payments'], NULL),
('page', '현장 즉시접수', '예약 없이 현장에서 바로 점검 접수', 'implemented', '/admin/walk-in', ARRAY['Next.js', 'Supabase'], NULL),
('page', '지식베이스 관리', 'PDF 업로드 및 웹서치 자동학습, 신뢰 도메인 관리', 'implemented', '/admin/knowledge', ARRAY['Voyage AI', 'Supabase'], NULL),
('page', 'CRM 고객관리', '고객 정보 및 점검 이력 관리', 'implemented', '/admin/crm/customers', ARRAY['Next.js', 'Supabase'], NULL),
('page', 'CRM 상담관리', '상담 기록 및 재상담 추적', 'implemented', '/admin/crm/consultations', ARRAY['Next.js', 'Supabase'], NULL),
('page', 'ERP 경영대시보드', '매출/경비/순이익 현황', 'implemented', '/admin/erp/dashboard', ARRAY['Next.js', 'Supabase'], NULL),
('page', 'ERP 경비관리', '사업 경비 입력 및 관리', 'implemented', '/admin/erp/expenses', ARRAY['Next.js', 'Supabase'], NULL),
('page', 'ERP 세금계산서', '청구서/세금계산서 발행', 'implemented', '/admin/erp/invoices', ARRAY['Next.js', 'Supabase', 'PDF'], NULL),
('page', 'ERP 작업자관리', '직원/외주 기사 관리', 'implemented', '/admin/erp/workers', ARRAY['Next.js', 'Supabase'], NULL),
('page', '풀 에이전트 채팅', 'AI 총괄 에이전트 채팅 — RAG 근거표시, 거짓/위험정보 자동차단, 문서작성 도구 포함', 'implemented', '/hq/chat', ARRAY['Claude API', 'RAG'], NULL),
('page', '문서 관리', '풀 에이전트가 생성한 문서 목록 및 PDF/Word 다운로드', 'implemented', '/admin/documents', ARRAY['Next.js', 'PDF', 'docx'], NULL),
('page', '시스템 통계', '교차검증 이력 및 코드리뷰 이력', 'implemented', '/admin/stats', ARRAY['Next.js', 'Supabase'], NULL),

-- 구현된 API
('api', 'RAG 검색', '지식베이스 벡터 검색', 'implemented', '/api/knowledge/search', ARRAY['Voyage AI', 'pgvector'], NULL),
('api', 'PDF 업로드', 'PDF 파싱 및 임베딩 저장', 'implemented', '/api/knowledge/upload', ARRAY['pdf-parse', 'Voyage AI'], NULL),
('api', '웹서치 학습', 'Tavily+Firecrawl 자동 학습, 신뢰도메인 필터+전수검증', 'implemented', '/api/knowledge/web-learn', ARRAY['Tavily', 'Firecrawl', 'Gemini'], NULL),
('api', '교차검증', 'Gemini 콘텐츠/RAG/경비/청구서/상담/작업자배정/채팅답변 검증', 'implemented', '/api/validate', ARRAY['Gemini 2.5 Flash'], NULL),
('api', '코드 리뷰', 'Gemini 자동 코드 리뷰', 'implemented', '/api/code-review', ARRAY['Gemini 2.5 Flash'], NULL),
('api', '카카오 발송', '알림톡/채널 메시지 자동 발송', 'implemented', '/api/kakao/send', ARRAY['Solapi'], NULL),
('api', '보증서 PDF', '디지털 보증서 PDF 발급', 'implemented', '/api/warranties/[warrantyNumber]/pdf', ARRAY['pdf-lib', 'Supabase'], NULL),
('api', 'GitHub 쓰기', '코드 파일 생성/수정 (풀 에이전트 도구용)', 'implemented', '/api/github/write', ARRAY['GitHub API'], NULL),
('api', '신뢰도메인 관리', '웹학습 허용 도메인 CRUD', 'implemented', '/api/admin/trusted-domains', ARRAY['Supabase'], NULL),
('api', 'CRM 재상담 발송', '재상담 알림톡 자동 발송', 'implemented', '/api/crm/follow-up-send', ARRAY['Solapi', 'Supabase'], NULL),

-- 구현된 핵심 기능 (HTTP 라우트로 직접 노출되지 않는 것 포함)
('feature', 'PDF 자동학습', 'PDF → 텍스트 → 청크 → 임베딩 → 검색', 'implemented', NULL, ARRAY['pdf-parse', 'Voyage AI', 'pgvector'], NULL),
('feature', '웹서치 자동학습', '키워드 검색 → 신뢰도메인 필터 → 전수검증 → 저장', 'implemented', NULL, ARRAY['Tavily', 'Firecrawl', 'Gemini'], NULL),
('feature', 'RAG 답변', '질문 → 벡터검색 → Claude 답변 → Gemini 검증', 'implemented', NULL, ARRAY['Voyage AI', 'Claude API', 'Gemini'], NULL),
('feature', '채팅 Gemini 검토', '풀 에이전트 답변 생성 후 Gemini 팩트체크 동기 실행', 'implemented', NULL, ARRAY['Gemini 2.5 Flash'], NULL),
('feature', '거짓답변 방지', 'RAG 근거 없으면 배지 표시, 거짓/위험정보 감지 시 답변 차단', 'implemented', NULL, ARRAY['Gemini', 'pgvector'], NULL),
('feature', '신뢰도메인 화이트리스트', '범주별 허용 도메인 DB 관리', 'implemented', NULL, ARRAY['Supabase'], NULL),
('feature', '청크 전수검증', '웹학습 시 모든 청크 Gemini 검증', 'implemented', NULL, ARRAY['Gemini 2.5 Flash'], NULL),
('feature', 'AI 문서 생성', '점검보고서/견적서/완료확인서 등을 Claude가 작성하고 Gemini가 검증 후 PDF+Word 생성', 'implemented', NULL, ARRAY['Claude API', 'Gemini', 'pdf-lib', 'docx'], '풀 에이전트 채팅의 generate_document 도구로만 호출됨 — 별도 REST API 없음'),
('feature', '코드 자동배포', 'GitHub Actions → Vercel 자동 배포', 'implemented', NULL, ARRAY['GitHub Actions', 'Vercel'], NULL),
('feature', 'Gemini 코드리뷰', '코드 변경 시 Gemini 자동 리뷰', 'implemented', NULL, ARRAY['Gemini 2.5 Flash'], NULL),
('feature', '풀 에이전트 저위험 자동구현', '채팅에서 저위험 코드 변경은 에이전트가 스스로 판단해 자동구현 파이프라인(사람검토 없이 병합) 트리거 가능', 'implemented', NULL, ARRAY['Claude Code Action', 'GitHub Actions'], NULL),
('feature', '디지털 보증서', '작업 완료 시 보증서 자동 발급', 'implemented', NULL, ARRAY['pdf-lib', 'Solapi'], NULL),
('feature', '6에이전트 시스템', 'CTO/CSO/CMO/COO/CFO/CLO 자동 보고', 'implemented', NULL, ARRAY['Claude API', 'GitHub Actions'], NULL),
('feature', '콘텐츠 자동생성', '블로그/카카오/유튜브 콘텐츠 AI 생성', 'implemented', NULL, ARRAY['Claude API'], NULL),

-- 연동된 외부 서비스
('integration', 'Claude API', 'Anthropic Claude Sonnet — 풀 에이전트/경영진 에이전트/문서생성', 'implemented', NULL, ARRAY['anthropic'], NULL),
('integration', 'Gemini API', 'Google Gemini 2.5 Flash — 교차검증/코드리뷰', 'implemented', NULL, ARRAY['google-ai'], NULL),
('integration', 'Voyage AI', 'voyage-3 임베딩 모델 — knowledge_chunks RAG', 'implemented', NULL, ARRAY['voyage-ai'], NULL),
('integration', 'Supabase', 'PostgreSQL + pgvector + Storage', 'implemented', NULL, ARRAY['supabase'], NULL),
('integration', 'Toss Payments', '결제 시스템', 'implemented', NULL, ARRAY['toss'], NULL),
('integration', 'Solapi', '카카오 알림톡 + SMS 발송', 'implemented', NULL, ARRAY['solapi'], NULL),
('integration', 'Tavily API', '웹 검색 자동학습', 'implemented', NULL, ARRAY['tavily'], NULL),
('integration', 'Firecrawl API', '웹사이트 크롤링', 'implemented', NULL, ARRAY['firecrawl'], NULL),
('integration', 'GitHub Actions', 'CI/CD + 자동화 워크플로우 + Claude Code Action', 'implemented', NULL, ARRAY['github'], NULL),
('integration', 'Vercel', '프로덕션 배포', 'implemented', NULL, ARRAY['vercel'], NULL),
('integration', 'OpenRouter', 'knowledge_base(별도 지식베이스) 임베딩', 'implemented', NULL, ARRAY['openrouter'], NULL),

-- 미구현/예정 기능
('pending', 'AR 기능', '증강현실 기반 전기점검', 'pending', NULL, NULL, NULL),
('pending', '음성인식', '음성으로 점검 결과 입력', 'pending', NULL, NULL, NULL),
('pending', '전기차 충전기 설치', '전기차 충전기 설치 서비스', 'pending', NULL, NULL, NULL),
('pending', 'BOMI 보험 플랫폼', '배우자 보험 영업 CRM', 'pending', NULL, NULL, NULL),
('pending', '모바일 앱', '기사용 현장 앱', 'pending', NULL, NULL, NULL),
('pending', 'Track C 전기공사업', '전기공사업 등록 후 직접 시공', 'pending', NULL, NULL, NULL),
('pending', '카카오페이 자동결제 연동', '카카오페이를 통한 자동/정기 결제', 'pending', NULL, NULL, NULL)
) AS v(category, name, description, status, path, tech_stack, note)
WHERE NOT EXISTS (
  SELECT 1 FROM project_features pf
  WHERE pf.category = v.category AND pf.name = v.name
);

-- Supabase 보안 어드바이저 경고(rls_disabled_in_public, 2026-08-23) 대응.
--
-- 아래 5개 테이블은 생성 시 ENABLE ROW LEVEL SECURITY 가 누락되어, anon key로 누구나
-- REST(PostgREST)를 통해 읽기/쓰기/삭제가 가능한 상태였다. 실측 확인(2026-08-26,
-- anon key로 count만 조회, 행 내용은 확인하지 않음): field_reports 4행, knowledge_chunks
-- 616행, schema_migrations 113행이 이미 공개 노출 중이었다.
--
-- 이 저장소의 다른 테이블과 동일한 패턴을 따른다: 정책(policy)을 별도로 만들지 않고
-- RLS만 켠다 — 이 프로젝트의 모든 서버 코드는 SUPABASE_SERVICE_ROLE_KEY로만 이 테이블들에
-- 접근하고(RLS를 우회함), 브라우저에서 anon key로 이 4개 테이블을 직접 쿼리하는 코드는
-- 없음을 확인했다(src/lib/supabase-browser.ts 사용처 9곳 전수 확인). 정책 없이 RLS만
-- 켜면 anon/authenticated 롤의 접근은 전부 차단되고 service role은 영향받지 않는다.

ALTER TABLE public.field_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balance_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.field_reports IS '현장 기술자 모바일 체크리스트 입력 — AI 소견 생성 파이프라인 입력 데이터 (서비스 role 전용)';
COMMENT ON TABLE public.account_ledger_entries IS '가상계좌/경비 시스템에 자동으로 안 잡히는 수기 계좌 입출금 기록 (서비스 role 전용)';
COMMENT ON TABLE public.account_balance_checkpoints IS '관리자가 주기적으로 입력하는 실제 통장 잔액 스냅샷 (서비스 role 전용)';
COMMENT ON TABLE public.knowledge_chunks IS 'Voyage 임베딩 RAG 청크 — knowledge_base와 별도 벡터공간 (서비스 role 전용)';

-- 보미(Bomi) 보험설계사 CRM 프로젝트 전면 취소(2026-07-17) — 관련 테이블 전부 제거.
-- dk-safety 전기안전 사업 테이블(reservations/tasks/workers 등)은 애초에 참조하지 않으므로
-- 영향 없음. 코드(src/app/bomi, src/app/api/bomi, src/lib/bomi-*.ts)와 스토리지 버킷
-- (dk-bomi-documents)도 같은 커밋에서 함께 제거한다.

drop table if exists public.bomi_claims cascade;
drop table if exists public.bomi_activity_log cascade;
drop table if exists public.bomi_coverage_analysis cascade;
drop table if exists public.bomi_medical_info cascade;
drop table if exists public.bomi_contracts cascade;
drop table if exists public.bomi_documents cascade;
drop table if exists public.bomi_customers cascade;
drop table if exists public.bomi_agents cascade;

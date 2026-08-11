-- A/S(애프터서비스) 재방문 건은 보증서를 추가로 발급하지 않는다(2026-08-11 정책).
-- 정산은 정상 진행되지만 warranty_status가 기존 4개 값(PENDING/ISSUED/EXPIRED/VOIDED) 중
-- "보증서 대상 자체가 아님"을 뜻하는 값이 없어 추가한다.
-- 주의: 이 파일은 반드시 이 값을 참조하는 애플리케이션 코드 배포보다 먼저 적용해야 하며,
-- 같은 트랜잭션/마이그레이션에서 새 enum 값을 바로 사용할 수 없으므로 이 파일에는 이 statement만 둔다.
alter type warranty_status_type add value if not exists 'NOT_APPLICABLE';

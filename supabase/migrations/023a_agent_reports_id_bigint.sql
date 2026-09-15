-- 023_agent_command_center.sql은 agent_reports.id를 UUID로 선언했다. 그런데 운영
-- 프로젝트의 실제 컬럼 타입은 BIGINT(nextval('agent_reports_id_seq'))다 —
-- 119_report_action_items.sql 자체의 주석에 "정보스키마로 실측 확인, 2026-09-04"로
-- 이미 기록돼 있던 기존 발견이다. 119는 이 불일치를 알고 report_id를 BIGINT로
-- 작성했다(운영 실제 타입을 따름).
--
-- 새 dev Supabase 프로젝트에서는 023이 agent_reports를 "처음" 만들기 때문에(운영은
-- 023 이전부터 이미 다른 실체가 있었던 것으로 추정 — 정확한 경위는 확인되지 않음)
-- 023의 선언대로 UUID로 만들어졌고, 그 결과 119를 적용할 때
-- "foreign key constraint ... cannot be implemented"로 실패했다(2026-09-15 발견).
--
-- 이 파일은 dev를 운영의 실제 상태에 맞추기 위한 소급 마이그레이션이다(023a — 023
-- 직후, 024 이전에 적용되도록 009a/055a와 같은 방식으로 번호를 붙였다). ★119 파일
-- 자체는 건드리지 않는다 — 119는 "운영이 실제로 BIGINT다"라는 발견을 정확히 기록한
-- 문서이므로, dev 사정으로 그 기록을 바꾸면 문서가 거짓이 된다.
--
-- ★운영에서 재실행돼도 무해하다 — 운영은 이미 BIGINT이므로 아래 IF 조건이 거짓이
-- 되어 아무 것도 실행되지 않는다(055a와 같은 기준). 조건 판정은 추측이 아니라
-- information_schema.columns로 현재 타입을 실제로 조회해서 한다.
--
-- ★알려진 부작용(dev에서 트랜잭션으로 감싸 실행 후 롤백하는 방식으로 실증 확인,
-- 2026-09-16): agent_reports에 FK로 참조하는 곳이 119(아직 미적용) 하나뿐이고 dev의
-- agent_reports 행 수가 0이라 DROP COLUMN + ADD COLUMN 방식을 썼다. 이 방식은
-- id 컬럼을 테이블 맨 뒤로 옮긴다(원래 1번째 컬럼 → 변경 후 10번째/마지막). 시퀀스
-- 이름(agent_reports_id_seq)과 PK 제약 이름(agent_reports_pkey)은 운영과 정확히
-- 일치하는 것을 확인했다 — Postgres가 BIGSERIAL 추가 시 <테이블>_<컬럼>_seq 규칙을
-- 그대로 따르기 때문이다. 컬럼 순서가 바뀌는 것 자체는 기능에 영향을 주지 않지만,
-- 이 부작용을 감수할지는 승인 시 판단 필요.

DO $$
DECLARE
  current_type text;
BEGIN
  -- 추측으로 분기하지 않는다 — information_schema.columns로 실제 타입을 조회한다.
  -- 테이블/컬럼이 없으면 current_type은 NULL이 되고, 아래 IF는 그냥 거짓이 되어
  -- 안전하게 아무 것도 하지 않는다(STRICT를 안 써서 0행이어도 에러 없음).
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'agent_reports'
    AND column_name = 'id';

  IF current_type = 'uuid' THEN
    EXECUTE 'ALTER TABLE public.agent_reports DROP COLUMN id';
    EXECUTE 'ALTER TABLE public.agent_reports ADD COLUMN id BIGSERIAL PRIMARY KEY';
  END IF;
END $$;

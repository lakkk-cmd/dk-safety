-- 119: 경영진 보고서 액션아이템(체크박스+메모) + boss_feedback 오염원 분리
--
-- 배경: hq 사령부 "피드백 이력"이 대표님이 직접 쓴 진짜 피드백과, 영상파이프라인/일일현황
-- cron이 자동으로 boss_feedback에 남기는 기술알림이 뒤섞여 있었다. 기술알림은 이미
-- recent-signals.ts의 원칙("AI가 스스로 발견한 걸 대장 명령처럼 위장시키면 안 됨")과
-- 정확히 반대로, 다음 회의 프롬프트에 "[대장 지시사항 — 반드시 반영]"으로 그대로 들어가고
-- 있었다. source 컬럼으로 과거 기록은 태깅해 필터링하고, 앞으로 신규 자동알림은 아예
-- boss_feedback에 쓰지 않고 agent_logs로 옮긴다(코드 변경, 이 마이그레이션과 세트).

-- 주의: agent_reports.id는 마이그레이션 파일상 UUID로 선언돼 있지만(023_agent_command_center.sql),
-- 실제 라이브 테이블은 그보다 먼저 존재해 CREATE TABLE IF NOT EXISTS가 조용히 무시됐고
-- 실제 컬럼 타입은 BIGINT다(정보스키마로 실측 확인, 2026-09-04). FK는 실제 타입을 따른다.
CREATE TABLE IF NOT EXISTS public.report_action_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  BIGINT NOT NULL REFERENCES public.agent_reports(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  done_at    TIMESTAMPTZ,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_action_items_report_idx
  ON public.report_action_items (report_id);
CREATE INDEX IF NOT EXISTS report_action_items_done_idx
  ON public.report_action_items (done, created_at DESC);

ALTER TABLE public.report_action_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.report_action_items IS
  '경영진 보고서에서 AI가 추출한 대표님 액션아이템 — 체크박스(done)+메모(note), 보고서 단위가 아닌 통합 할일목록으로 관리';

-- boss_feedback: 자동 기술알림 태깅 + 과거 기록 백필 (신규 자동알림은 코드에서 더 이상 안 씀)
ALTER TABLE public.boss_feedback
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'
  CHECK (source IN ('user', 'system'));

UPDATE public.boss_feedback
SET source = 'system'
WHERE source = 'user'
  AND (
    content LIKE '[영상 이미지 OCR 실패]%'
    OR content LIKE '자동 일일 현황 보고:%'
  );

COMMENT ON COLUMN public.boss_feedback.source IS
  '''user''=대표님이 직접 입력한 피드백, ''system''=과거 자동알림 백필 태그(2026-09-04 이후 신규 자동알림은 agent_logs로 이관되어 더 이상 생기지 않음)';

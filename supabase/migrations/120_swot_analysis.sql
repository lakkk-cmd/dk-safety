-- 120: SWOT/TOWS 분기별 전략 분석 (/hq/swot 탭)
--
-- 배경: 대표님 요청(2026-09-06)으로 분기마다 자동 재생성되는 SWOT 분석 + TOWS 전략
-- 매트릭스를 신설. TOWS에서 도출된 "대표님이 직접 해야 할 일"은 기존 홈 화면의
-- report_action_items 체크리스트와 같은 테이블에 통합해서 보여준다(대표님 지시) — 단,
-- 기존 테이블은 report_id를 agent_reports 필수 참조로 강제하고 있어 SWOT 기원 항목을
-- 넣을 수 없었으므로, report_id를 nullable로 바꾸고 swot_analysis_id를 추가한 뒤
-- 둘 중 정확히 하나만 채워지도록 강제한다.

CREATE TABLE IF NOT EXISTS public.swot_analyses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  quarter_label  TEXT NOT NULL,
  summary        TEXT,
  strengths      JSONB NOT NULL DEFAULT '[]',
  weaknesses     JSONB NOT NULL DEFAULT '[]',
  opportunities  JSONB NOT NULL DEFAULT '[]',
  threats        JSONB NOT NULL DEFAULT '[]',
  tows_so        JSONB NOT NULL DEFAULT '[]',
  tows_wo        JSONB NOT NULL DEFAULT '[]',
  tows_st        JSONB NOT NULL DEFAULT '[]',
  tows_wt        JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS swot_analyses_created_idx
  ON public.swot_analyses (created_at DESC);

ALTER TABLE public.swot_analyses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.swot_analyses IS
  'SWOT 분석 + TOWS(SO/WO/ST/WT) 전략 매트릭스 — 분기별 자동 재생성(swot-analysis 크론), /hq/swot 탭에 표시';

ALTER TABLE public.report_action_items
  ALTER COLUMN report_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS swot_analysis_id UUID REFERENCES public.swot_analyses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS report_action_items_swot_idx
  ON public.report_action_items (swot_analysis_id);

ALTER TABLE public.report_action_items
  DROP CONSTRAINT IF EXISTS report_action_items_source_check;
ALTER TABLE public.report_action_items
  ADD CONSTRAINT report_action_items_source_check
  CHECK ((report_id IS NOT NULL)::int + (swot_analysis_id IS NOT NULL)::int = 1);

COMMENT ON COLUMN public.report_action_items.swot_analysis_id IS
  'SWOT/TOWS 분석에서 추출된 액션아이템일 때만 채워짐 — report_id와 정확히 하나만 NOT NULL(둘 다 또는 둘 다 아님 금지)';

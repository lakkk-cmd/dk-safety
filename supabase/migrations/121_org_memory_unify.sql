-- 121: 조직 기억 통합
--
-- 배경(2026-09-06 발견): agent_memory(주간 6인 경영진회의 전용, 구조화 JSON blob)와
-- agent_shared_memory(9-에이전트 채팅이 실제로 읽는 실시간 스트림)가 서로 완전히 분리돼 있어서,
-- 대표님이 한쪽 대화(예: 총괄디렉터 채팅)에서 결정한 내용을 다른 쪽(주간회의, daily-scan,
-- SWOT분석)이 전혀 모르는 문제가 반복됐다. 두 테이블을 category 태그를 가진 단일
-- append-only 테이블로 합치고, 기존 데이터를 전부 백필한다.

CREATE TABLE IF NOT EXISTS public.agent_memory_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  category        TEXT NOT NULL DEFAULT 'note'
                  CHECK (category IN ('decision','open_question','kpi','theme','meeting_summary','note')),
  source_agent_id TEXT NOT NULL DEFAULT 'system',
  content         TEXT NOT NULL,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS agent_memory_entries_created_idx
  ON public.agent_memory_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_memory_entries_category_idx
  ON public.agent_memory_entries (category, created_at DESC);

ALTER TABLE public.agent_memory_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agent_memory_entries' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.agent_memory_entries FOR ALL USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.agent_memory_entries IS
  '조직 전체 통합 기억 — 주간 경영진회의(decision/open_question/kpi/theme/meeting_summary)와 9-에이전트 채팅(note)이 하나의 테이블을 공유한다. agent_memory/agent_shared_memory를 대체(2026-09-06).';

-- 백필 1: agent_shared_memory 전체 → note
INSERT INTO public.agent_memory_entries (created_at, category, source_agent_id, content)
SELECT created_at, 'note', source_agent_id, content
FROM public.agent_shared_memory;

-- 백필 2: agent_memory.structured_v1의 구조화 배열들 → 항목별 행
DO $$
DECLARE
  raw TEXT;
  doc JSONB;
  item TEXT;
  meeting JSONB;
  idx INT := 0;
  total INT;
BEGIN
  SELECT content INTO raw FROM public.agent_memory WHERE key = 'structured_v1';
  IF raw IS NULL OR raw = '' THEN RETURN; END IF;
  doc := raw::jsonb;

  FOR item IN SELECT jsonb_array_elements_text(COALESCE(doc->'decisions', '[]'::jsonb)) LOOP
    INSERT INTO public.agent_memory_entries (category, source_agent_id, content)
    VALUES ('decision', 'chief', item);
  END LOOP;

  FOR item IN SELECT jsonb_array_elements_text(COALESCE(doc->'openQuestions', '[]'::jsonb)) LOOP
    INSERT INTO public.agent_memory_entries (category, source_agent_id, content)
    VALUES ('open_question', 'chief', item);
  END LOOP;

  FOR item IN SELECT jsonb_array_elements_text(COALESCE(doc->'kpis', '[]'::jsonb)) LOOP
    INSERT INTO public.agent_memory_entries (category, source_agent_id, content)
    VALUES ('kpi', 'chief', item);
  END LOOP;

  FOR item IN SELECT jsonb_array_elements_text(COALESCE(doc->'strategicThemes', '[]'::jsonb)) LOOP
    INSERT INTO public.agent_memory_entries (category, source_agent_id, content)
    VALUES ('theme', 'chief', item);
  END LOOP;

  SELECT jsonb_array_length(COALESCE(doc->'recentMeetings', '[]'::jsonb)) INTO total;
  FOR meeting IN SELECT jsonb_array_elements(COALESCE(doc->'recentMeetings', '[]'::jsonb)) LOOP
    INSERT INTO public.agent_memory_entries (created_at, category, source_agent_id, content, meta)
    VALUES (
      now() - ((total - idx) * interval '1 second'),
      'meeting_summary',
      'chief',
      COALESCE(meeting->>'chiefSummary', ''),
      jsonb_build_object('date', meeting->>'date', 'topic', meeting->>'topic', 'topActions', COALESCE(meeting->'topActions', '[]'::jsonb))
    );
    idx := idx + 1;
  END LOOP;

  IF (doc->>'feedbackNotes') IS NOT NULL AND (doc->>'feedbackNotes') <> '' THEN
    INSERT INTO public.agent_memory_entries (category, source_agent_id, content)
    VALUES ('note', 'chief', '[대장 피드백 반영 메모] ' || (doc->>'feedbackNotes'));
  END IF;
END $$;

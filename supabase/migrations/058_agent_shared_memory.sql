-- 058: 9-에이전트 공유 메모리 계층
-- 어느 에이전트와의 대화에서든 감지된 핵심 사실/결정/선호를 여기에 기록하면,
-- buildBusinessSnapshot()을 통해 9개 에이전트 전부가 다음 턴부터 참조한다.

CREATE TABLE IF NOT EXISTS public.agent_shared_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content         TEXT NOT NULL,
  source_agent_id TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_shared_memory_created_idx
  ON public.agent_shared_memory (created_at DESC);

ALTER TABLE public.agent_shared_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agent_shared_memory' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.agent_shared_memory FOR ALL USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.agent_shared_memory IS '9-에이전트 공유 메모리 — 어느 에이전트 대화에서든 감지된 핵심 사실/결정을 기록, buildBusinessSnapshot()으로 전 에이전트에 전파 (서버 service role 전용)';

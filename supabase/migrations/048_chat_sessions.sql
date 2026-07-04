-- 대화 세션 저장/복원 테이블
-- chat_sessions: 세션 메타데이터 (요약, 결정사항, 작업 목록)
-- chat_messages: 세션별 메시지 기록
-- key_decisions: 활성 핵심 결정 사항

-- ① 세션 메타데이터
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id       TEXT PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  summary          TEXT,
  key_decisions    JSONB,
  completed_tasks  TEXT[],
  pending_tasks    TEXT[],
  context_snapshot JSONB
);

CREATE INDEX IF NOT EXISTS chat_sessions_started_at_idx ON chat_sessions (started_at DESC);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_sessions'
      AND policyname='service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON chat_sessions
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ② 메시지 기록
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL DEFAULT '',
  tool_calls  JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON chat_messages (session_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='chat_messages'
      AND policyname='service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON chat_messages
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ③ 핵심 결정 사항
CREATE TABLE IF NOT EXISTS key_decisions (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES chat_sessions (session_id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('pricing', 'content', 'tech', 'strategy', 'legal')),
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS key_decisions_active_idx ON key_decisions (is_active, decided_at DESC);

ALTER TABLE key_decisions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='key_decisions'
      AND policyname='service role full access'
  ) THEN
    CREATE POLICY "service role full access" ON key_decisions
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

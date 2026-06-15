-- 5단계 추가: AI 사령부 9-에이전트 채팅 히스토리

CREATE TABLE IF NOT EXISTS public.agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_chat_messages_agent_idx
  ON public.agent_chat_messages (agent_id, created_at);

ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.agent_chat_messages IS 'AI 사령부 9-에이전트(경영진 6 + 콘텐츠 3) 채팅 히스토리 — 서버 service role 전용';

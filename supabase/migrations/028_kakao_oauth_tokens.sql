-- 028: 카카오 "나에게 보내기" 메모 API용 OAuth 2.0 토큰 (대장 계정, 단일 행)

CREATE TABLE IF NOT EXISTS public.kakao_oauth_tokens (
  id                       INT PRIMARY KEY DEFAULT 1,
  access_token             TEXT,
  refresh_token            TEXT,
  expires_at               TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

ALTER TABLE public.kakao_oauth_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.kakao_oauth_tokens IS '콘텐츠 마케팅 사령부 — 카카오 "나에게 보내기" 메모 API용 OAuth 2.0 토큰 (서버 service role 전용)';

-- site_decisions/site_config는 마이그레이션 파일 없이(운영 Supabase 대시보드에서
-- 직접) 생성돼 있었다. 새 dev 프로젝트에 001~128번 마이그레이션을 순서대로 적용하다가
-- 056_site_decisions_label_column.sql(ALTER TABLE public.site_decisions ADD COLUMN
-- label)이 "relation "public.site_decisions" does not exist"로 실패해 발견됐다
-- (2026-09-15). 운영의 실제 정의(컬럼/제약/인덱스/RLS)를 SQL Editor로 직접 조회해
-- 그대로 옮긴 것이 이 파일이다 — 추측으로 보완한 컬럼은 없다.
--
-- 운영에서 실행돼도 무해하다 — 운영엔 이미 두 테이블이 있으므로 CREATE TABLE
-- IF NOT EXISTS와 조건부 정책 생성(018_extra_fee_confirm_fields.sql의 패턴)으로
-- 전부 no-op이 된다.
--
-- ★알려진 문제(수정하지 않고 운영 그대로 옮김, docs/BACKLOG.md "dk-safety 자체의
-- 위험" 절에 등록됨 — 여기서 고치지 않는다):
--   1) idx_site_config_key가 site_config_key_key(UNIQUE 제약의 자동 인덱스)와
--      같은 컬럼(key)에 중복 생성돼 있다 — 조회는 UNIQUE가 이미 커버하므로 불필요.
--   2) site_config/site_decisions의 RLS 정책 "service_role_all"은 이름과 달리
--      roles가 {public}이라 실질적으로 RLS가 열려 있다(anon 키로도 접근 가능).

CREATE TABLE IF NOT EXISTS public.site_config (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  key         text        NOT NULL,
  value       text        NOT NULL,
  label       text,
  category    text,
  updated_at  timestamptz DEFAULT now(),
  updated_by  text        DEFAULT 'boss'::text,
  CONSTRAINT site_config_pkey PRIMARY KEY (id),
  CONSTRAINT site_config_key_key UNIQUE (key)
);

CREATE TABLE IF NOT EXISTS public.site_decisions (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  session_id      text,
  decision_type   text        NOT NULL,
  target_page     text        NOT NULL,
  key             text        NOT NULL,
  value           text        NOT NULL,
  prev_value      text,
  status          text        DEFAULT 'pending'::text,
  boss_confirmed  boolean     DEFAULT false,
  applied_at      timestamptz,
  created_at      timestamptz DEFAULT now(),
  label           text,
  CONSTRAINT site_decisions_pkey PRIMARY KEY (id)
);

-- 인덱스 — PK/UNIQUE 제약이 자동 생성하는 것(site_config_pkey/site_config_key_key/
-- site_decisions_pkey)은 중복 생성하지 않는다. idx_ 접두사 인덱스만 별도 생성한다.
CREATE INDEX IF NOT EXISTS idx_site_config_category ON public.site_config USING btree (category);
CREATE INDEX IF NOT EXISTS idx_site_config_key ON public.site_config USING btree (key);
CREATE INDEX IF NOT EXISTS idx_site_decisions_created ON public.site_decisions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_decisions_page ON public.site_decisions USING btree (target_page, status);
CREATE INDEX IF NOT EXISTS idx_site_decisions_type ON public.site_decisions USING btree (decision_type, status);

-- RLS 활성화(이미 켜져 있어도 안전하게 재실행 가능 — 2026-09-15 dev에서 실증: 속성
-- 변경 문이라 이름 충돌 개념이 없어, 이미 활성인 테이블에 재실행해도 에러 없이
-- no-op이다).
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_decisions ENABLE ROW LEVEL SECURITY;

-- RLS 정책 — 운영 실제 정의 그대로 옮김(roles={public}, USING(true), WITH CHECK 없음).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_config'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all
      ON public.site_config FOR ALL TO public USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_decisions'
      AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all
      ON public.site_decisions FOR ALL TO public USING (true);
  END IF;
END $$;

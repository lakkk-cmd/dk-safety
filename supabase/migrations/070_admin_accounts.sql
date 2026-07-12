-- 관리자 계정(여러 명) + 프로필 관리
--
-- 지금까지 관리자 인증은 ADMIN_PASSWORD 환경변수 하나와 비교하는 단일 공유 비밀번호
-- 방식이라 "관리자 정보"라는 개념 자체가 DB에 없었다. 이 테이블로 대표님 외 직원도
-- 각자 이름/연락처/비밀번호로 로그인할 수 있게 한다. 기존 dk_admin_auth 쿠키 게이트
-- (middleware.ts)는 그대로 두고, 이 테이블은 "누가 로그인했는지" 식별하는 용도로만
-- 얹는다 — 기존 인증 흐름을 깨지 않는다.

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists admin_accounts_phone_lower_idx on public.admin_accounts (lower(trim(phone)));

-- anon 직접 접근은 막고, Next.js API(서비스 롤)만 사용합니다.
alter table public.admin_accounts enable row level security;

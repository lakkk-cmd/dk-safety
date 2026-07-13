-- 보미(Bomi): 보험설계사 CRM + AI 보장분석 — dk-safety 전기안전 사업과 완전 별도 서비스.
-- 라우팅은 bomi.dkansim.com → /bomi (middleware.ts), 인증은 dk_bomi_auth 쿠키로 완전 격리.
-- 기존 reservations/tasks/workers 등 전기안전 테이블은 전혀 참조하지 않는다.
-- 지금은 대표님 단독 사용이지만 agent_id를 처음부터 둬서, 다른 설계사가 늘어나도
-- 스키마 변경 없이 확장 가능하게 한다.

create table if not exists public.bomi_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists bomi_agents_phone_lower_idx on public.bomi_agents (lower(trim(phone)));

create table if not exists public.bomi_customers (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.bomi_agents (id) on delete set null,

  name text not null,
  phone text not null default '',
  birth_date date,
  gender text check (gender in ('남', '여')),
  occupation text not null default '',

  family_note text not null default '',
  financial_note text not null default '',
  memo text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bomi_customers_agent_id_idx on public.bomi_customers (agent_id);
create index if not exists bomi_customers_name_idx on public.bomi_customers (name);

create table if not exists public.bomi_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bomi_customers (id) on delete cascade,

  doc_type text not null default '증권'
    check (doc_type in ('신분증', '가입설계서', '증권', '청약서', '청구자료', '기타')),
  url text not null,
  original_filename text not null default '',

  ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'processing', 'done', 'failed')),
  ocr_result jsonb,
  ocr_error text,

  created_at timestamptz not null default now()
);

create index if not exists bomi_documents_customer_id_idx on public.bomi_documents (customer_id);

create table if not exists public.bomi_contracts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bomi_customers (id) on delete cascade,
  document_id uuid references public.bomi_documents (id) on delete set null,

  insurer text not null default '',
  product_name text not null default '',
  contract_date date,
  premium_amount integer,
  payment_cycle text not null default '',
  maturity_date date,
  status text not null default 'active'
    check (status in ('active', 'lapsed', 'matured', 'cancelled')),

  created_at timestamptz not null default now()
);

create index if not exists bomi_contracts_customer_id_idx on public.bomi_contracts (customer_id);
create index if not exists bomi_contracts_maturity_date_idx on public.bomi_contracts (maturity_date);

-- 민감정보(개인정보보호법상 별도 동의 대상) — service-role 경로로만 접근, RLS로 anon 차단.
create table if not exists public.bomi_medical_info (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bomi_customers (id) on delete cascade,

  condition_name text not null default '',
  diagnosed_at date,
  note text not null default '',
  exclusion_clause text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists bomi_medical_info_customer_id_idx on public.bomi_medical_info (customer_id);
comment on table public.bomi_medical_info is '민감정보(질병/사고 이력) — 개인정보보호법상 별도 동의 필요, service-role 경로로만 접근.';

create table if not exists public.bomi_coverage_analysis (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bomi_customers (id) on delete cascade,
  document_id uuid references public.bomi_documents (id) on delete set null,

  category_coverage jsonb not null default '{}'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  summary text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists bomi_coverage_analysis_customer_id_idx on public.bomi_coverage_analysis (customer_id);
comment on table public.bomi_coverage_analysis is '표준 보장 카테고리 기준 과부족 진단 — 특정 상품 추천은 하지 않는다(모집행위 경계).';

create table if not exists public.bomi_activity_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bomi_customers (id) on delete cascade,
  agent_id uuid references public.bomi_agents (id) on delete set null,

  content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists bomi_activity_log_customer_id_idx on public.bomi_activity_log (customer_id);

create table if not exists public.bomi_claims (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bomi_customers (id) on delete cascade,
  contract_id uuid references public.bomi_contracts (id) on delete set null,

  claim_type text not null default '',
  claim_date date,
  amount integer,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'paid')),
  note text not null default '',

  created_at timestamptz not null default now()
);

create index if not exists bomi_claims_customer_id_idx on public.bomi_claims (customer_id);

-- anon 직접 접근은 막고, Next.js API(서비스 롤)만 사용합니다.
alter table public.bomi_agents enable row level security;
alter table public.bomi_customers enable row level security;
alter table public.bomi_documents enable row level security;
alter table public.bomi_contracts enable row level security;
alter table public.bomi_medical_info enable row level security;
alter table public.bomi_coverage_analysis enable row level security;
alter table public.bomi_activity_log enable row level security;
alter table public.bomi_claims enable row level security;

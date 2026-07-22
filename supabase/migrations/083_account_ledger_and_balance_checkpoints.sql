-- 계좌 입출 수기 기록 + 장부-실제잔액 대사(reconciliation) 기능.
--
-- 은행 API 연동이 없어 실시간 잔액 조회는 구조적으로 불가능하지만, 관리자가 주기적으로
-- 실제 통장 잔액을 입력해두면(account_balance_checkpoints), 그 시점 이후 시스템에 이미
-- 기록된 입출금(가상계좌 입금/자동·수동 환불/경비/기사수당)과 여기 새로 추가하는 수기
-- 입출금(account_ledger_entries — 은행수수료·이자 등 시스템에 안 잡히는 항목)을 합산해
-- "장부상 예상 잔액"을 계산하고 실제 잔액과 비교(대사)할 수 있게 한다
-- (2026-07-23 금융/가상계좌 관리 화면 점검 중 요청).

create table if not exists public.account_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  direction text not null check (direction in ('IN', 'OUT')),
  amount integer not null check (amount > 0),
  category text not null default '기타',
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists account_ledger_entries_date_idx on public.account_ledger_entries (entry_date desc);

create table if not exists public.account_balance_checkpoints (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  balance integer not null,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists account_balance_checkpoints_checked_at_idx on public.account_balance_checkpoints (checked_at desc);

comment on table public.account_ledger_entries is '가상계좌/경비 시스템에 자동으로 안 잡히는 수기 계좌 입출금 기록(은행수수료, 이자, 현금 등)';
comment on table public.account_balance_checkpoints is '관리자가 주기적으로 입력하는 실제 통장 잔액 스냅샷 — 장부상 예상 잔액과 비교(대사)하는 기준점';

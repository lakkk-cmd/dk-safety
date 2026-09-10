-- "고객별 보기(CRM)" 화면의 고객을 실제 저장 데이터로 전환한다(2026-09-10, 대표님 결정:
-- "가망 잠재고객도 실제 고객데이터로 남아야 한다"). 지금까지는 reservations/consultation_logs를
-- 전화번호로 즉석 집계하는 가상 뷰(listCustomerSummary)였을 뿐, "고객"이라는 실체가 DB 어디에도
-- 없었다 — 그래서 수정 대상 자체가 없어 수정 기능을 만들 수 없었다.
--
-- 설계: crm_customers를 고객 프로필의 단일 소스로 두고, reservations/consultation_logs/
-- follow_up_reminders에 customer_id를 연결한다. 점검횟수·최근서비스일 등은 저장하지 않고
-- 연결된 예약/상담기록을 실시간 집계해서 보여준다(listCustomerSummary 재작성, 앱 코드에서 처리) —
-- 항상 정확하고, 이 마이그레이션은 스키마만 다룬다.
--
-- 정책(대표님 확정, 2026-09-10):
-- 1) 같은 전화번호로 새 예약·상담기록이 들어와도 고객프로필(이름/주소)은 절대 자동으로 덮어쓰지
--    않는다 — 각 예약·상담기록은 그 시점 값을 자기 행에 그대로 보존(reservations.name/address,
--    consultation_logs.customer_name/address는 지금처럼 각자의 스냅샷으로 남는다). 고객프로필은
--    관리자가 명시적으로 수정할 때만 바뀐다.
-- 2) 번호가 바뀌었거나 실수로 두 번 등록된 동일인을 관리자가 수동으로 합칠 수 있어야 한다
--    (crm_customer_alt_phones + merged_into_id로 지원).
-- 3) "삭제"는 목록에서 숨기는 것(hidden_at)만 의미한다 — 원본 예약·상담기록은 그대로 둔다.

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null,
  address text,
  -- "예약" | consultation_logs.source 라벨 | "관리자 직접등록" 등, 화면 표시용 참고 문자열일 뿐 FK 아님
  registered_via text,
  registered_at timestamptz not null default now(),
  -- 체크박스 "삭제" = 목록에서만 숨김. null이면 정상 표시.
  hidden_at timestamptz,
  -- 병합으로 이 행이 다른 고객에 흡수됐으면 그 대상을 가리킨다. null이면 살아있는 대표 고객.
  merged_into_id uuid references public.crm_customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_customers is
  '고객 프로필의 단일 소스(2026-09-10 신설) — 예약/상담기록은 각자의 시점 스냅샷(name/phone/address)을
   그대로 보존하고, 이 테이블만 관리자가 직접 수정하는 "현재 고객정보"를 담는다.';
comment on column public.crm_customers.hidden_at is '체크박스 삭제 = 목록 숨김. 원본 예약·상담기록에는 영향 없음.';
comment on column public.crm_customers.merged_into_id is '병합으로 흡수된 경우 대표 고객 id. null이면 이 행이 대표.';

-- 번호 변경/중복등록으로 같은 사람이 다른 전화번호를 쓰던 이력 — 병합 시 이전 번호를 여기로 옮겨서
-- 예전 번호로 다시 연락이 와도 같은 고객으로 계속 인식되게 한다.
create table if not exists public.crm_customer_alt_phones (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers(id) on delete cascade,
  phone text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.crm_customer_alt_phones is
  '고객 병합 시 흡수된 예전 전화번호 기록(2026-09-10) — 예전 번호로 재문의가 와도 같은 고객으로 계속 연결하기 위함.';

alter table public.reservations add column if not exists customer_id uuid references public.crm_customers(id) on delete set null;
alter table public.consultation_logs add column if not exists customer_id uuid references public.crm_customers(id) on delete set null;
alter table public.follow_up_reminders add column if not exists customer_id uuid references public.crm_customers(id) on delete set null;

comment on column public.reservations.customer_id is 'crm_customers 연결(2026-09-10) — 예약 자체의 name/phone/address는 그 시점 스냅샷으로 별개 보존.';
comment on column public.consultation_logs.customer_id is 'crm_customers 연결(2026-09-10) — customer_name/customer_phone/address는 그 시점 스냅샷으로 별개 보존.';

create index if not exists crm_customers_phone_idx on public.crm_customers(phone);
create index if not exists crm_customer_alt_phones_phone_idx on public.crm_customer_alt_phones(phone);
create index if not exists reservations_customer_id_idx on public.reservations(customer_id);
create index if not exists consultation_logs_customer_id_idx on public.consultation_logs(customer_id);
create index if not exists follow_up_reminders_customer_id_idx on public.follow_up_reminders(customer_id);

alter table public.crm_customers enable row level security;
alter table public.crm_customer_alt_phones enable row level security;

drop policy if exists service_all on public.crm_customers;
create policy service_all on public.crm_customers for all to service_role using (true) with check (true);

drop policy if exists service_all on public.crm_customer_alt_phones;
create policy service_all on public.crm_customer_alt_phones for all to service_role using (true) with check (true);

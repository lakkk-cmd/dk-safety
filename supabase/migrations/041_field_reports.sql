-- 현장 기술자 모바일 체크리스트 입력 — AI 소견 생성 파이프라인 입력 데이터
create table if not exists public.field_reports (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  worker_id uuid references public.workers (id) on delete set null,

  apartment_address text not null default '',
  inspected_at timestamptz not null default now(),

  breaker_trip_current_ma numeric,
  main_breaker_capacity_a integer,
  insulation_resistance_mohm numeric,
  leakage_detected boolean not null default false,
  leakage_path_note text not null default '',

  breaker_year integer,
  breaker_visual_status text check (breaker_visual_status in ('정상', '과열흔적', '소손', '교체필요')),

  unit_area_sqm numeric,
  outlet_overheat boolean not null default false,
  outlet_overheat_note text not null default '',
  wiring_damage boolean not null default false,
  wiring_damage_note text not null default '',
  grounding_status text check (grounding_status in ('정상', '불량', '미확인')),

  risk_level text check (risk_level in ('안전', '주의', '경고', '위험')),
  urgent_parts jsonb not null default '[]'::jsonb,
  site_memo text not null default '',
  photo_urls jsonb not null default '[]'::jsonb,

  status text not null default 'draft' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_reports_reservation_id_idx on public.field_reports (reservation_id);
create index if not exists field_reports_worker_id_idx on public.field_reports (worker_id);

comment on table public.field_reports is '현장 기술자 모바일 체크리스트 입력 — AI 소견 생성 파이프라인 입력 데이터';

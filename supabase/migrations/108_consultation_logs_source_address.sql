-- 고객별 보기(잠재고객) 화면에서 "이 사람이 어느 경로로, 언제, 어느 주소로 등록됐는지"를
-- 확인할 수 없다는 문제(2026-08-24) — 원인은 세대전기점검 자동등록/관리자 수동 잠재고객
-- 등록/엑셀 일괄등록 세 경로가 전부 channel='visit' 하나로 뭉뚱그려져 있었고, 주소는 구조화
-- 없이 content 자유텍스트 안에만 묻혀 있었기 때문이다. channel은 "상담 수단"(전화/카카오/방문/문자)
-- 이라는 별개 의미로 계속 쓰고, 등록 경로는 새 source 컬럼으로 분리한다.
alter table public.consultation_logs
  add column if not exists source text
    check (source is null or source in ('unit_inspection', 'manual_lead', 'excel_import', 'consultation')),
  add column if not exists address text;

comment on column public.consultation_logs.source is
  '고객이 이 시스템에 최초로 등록된 경로 — unit_inspection(세대전기점검 방문 시 자동등록)/manual_lead(관리자 직접 잠재고객 등록)/excel_import(엑셀 일괄등록)/consultation(상담관리에서 직접 기록). channel(상담 수단)과는 별개 개념.';
comment on column public.consultation_logs.address is
  '등록 시점에 알 수 있었던 주소(세대전기점검이면 단지명+동/호, 수동/엑셀 등록이면 관리자가 입력한 값). 모르면 null.';

-- 기존 행 소급 분류 — content 문구 패턴으로 최선 추정한다(그 이후 컬럼이 생겼으니 원본 문구는
-- 이미 확정된 값이라 안전하게 매칭 가능). 패턴에 안 걸리는 행은 null로 남아 "확인불가"로 표시된다.
update public.consultation_logs
set source = 'unit_inspection',
    address = trim(substring(content from '세대전기점검\(직무고시\) — (.+)$'))
where channel = 'visit' and content like '세대전기점검(직무고시) — %' and source is null;

update public.consultation_logs
set source = 'manual_lead'
where channel = 'visit' and content = '잠재고객 명함 등록' and source is null;

update public.consultation_logs
set source = 'excel_import'
where channel = 'visit' and content = '엑셀 일괄등록' and source is null;

update public.consultation_logs
set source = 'consultation'
where channel in ('phone', 'kakao', 'sms') and source is null;

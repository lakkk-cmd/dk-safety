-- 세대전기점검(직무고시) 방문점검 시 세대 연락처를 함께 받아, 점검 즉시 자동 안전진단
-- 결과를 문자/카카오로 발송하고 CRM 접점 기록을 남긴다(2026-08 실사용 확장) —
-- 원래 이 기능을 시작한 동기(관리사무소 협업으로 세대 연락처 확보)를 실제로 완성한다.
alter table public.unit_electrical_inspections
  add column if not exists resident_phone text;

comment on column public.unit_electrical_inspections.resident_phone is
  '세대 연락처 — 방문점검만 필수. 점검 완료 즉시 자동 안전진단 결과를 이 번호로 발송한다.';

-- 자재 카탈로그(material_catalog)에 원가(cost_price)를 추가해 부품별 원가 대비 마진을
-- 관리자 화면에서 바로 확인할 수 있게 한다. unit_price(고객 청구가)는 이미 있었지만
-- 실제 구매 원가가 없어서 "이 부품을 이 가격에 팔면 남는 게 있는지" 알 방법이 없었다
-- (2026-07-23 구매/재고 관리 점검 중 요청).
--
-- nullable로 둔다 — 기존 품목들은 원가를 아직 모르므로 강제로 0을 넣지 않고, 관리자가
-- 하나씩 채워나갈 수 있게 한다. 원가가 없는 품목은 화면에서 마진을 "-"로 표시한다.

alter table public.material_catalog
  add column if not exists cost_price integer;

comment on column public.material_catalog.cost_price is '실제 구매 원가(원). unit_price(청구가)와의 차이가 마진. 모르면 비워둔다.';

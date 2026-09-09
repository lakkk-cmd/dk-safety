-- 배경(2026-09-09): 관리자가 아파트를 새로 등록할 때 partnership_type을 명시적으로 지정하지
-- 않으면 컬럼 기본값 'contract'가 그대로 들어가, "정식 유상계약 단지"라는 뜻의 배지가 실제로는
-- 아직 계약이 없는(고객 요청으로 등록만 한) 단지에도 붙는 문제가 실사용 중 발견됨. 원래 'contract'
-- 기본값은 109에서 기존 단지를 백필할 때만 쓰려던 값이었는데, 이후 신규 생성 경로가 이 기본값을
-- 그대로 물려받게 방치돼 있었다.
--
-- 'unconfirmed'(계약미정) 상태를 추가해 신규 등록의 기본값으로 삼고, 실제 계약이 체결됐을 때만
-- 관리자가 수동으로 'contract'로 전환한다(대표님 확인: 2026-09-09 기준 정식 계약 체결 단지 없음).

alter table public.apartments drop constraint if exists apartments_partnership_type_check;
alter table public.apartments
  add constraint apartments_partnership_type_check
  check (partnership_type in ('contract', 'unconfirmed', 'free_app', 'demo'));

alter table public.apartments alter column partnership_type set default 'unconfirmed';

-- 기존에 'contract'로 백필돼 있던 단지 중 실제로는 정식계약이 체결되지 않은 건들을 재분류.
update public.apartments set partnership_type = 'unconfirmed' where partnership_type = 'contract';

comment on column public.apartments.partnership_type is
  '계약미정(unconfirmed, 신규 등록 기본값) vs 정식계약(contract, 관리자가 실제 계약 체결 후 수동 전환)
   vs 세대전기점검 무료앱만 쓰는 단지(free_app) vs 영업 시연 전용 단지(demo). 예약/과금 로직을 게이팅하지
   않는 순수 표시·필터용 구분.';

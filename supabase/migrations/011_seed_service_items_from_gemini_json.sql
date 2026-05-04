-- Seed default service_items from gemini-code-1777648751250.json
-- Idempotent: update existing global rows by name, insert if missing.

do $$
begin
  -- 1) 기본 출장비 (common)
  update public.service_items
  set
    service_type = 'VISIT',
    description = '배정 활성화를 위한 필수 선결제 금액',
    base_fee_override = 50000,
    min_fee = 50000,
    max_fee = 50000,
    unit_price = null,
    deductible_flag = true,
    is_active = true,
    display_order = 1
  where apt_id is null and name = '기본 출장비';

  if not exists (
    select 1 from public.service_items where apt_id is null and name = '기본 출장비'
  ) then
    insert into public.service_items (
      apt_id, service_type, name, description, base_fee_override, min_fee, max_fee, unit_price,
      deductible_flag, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, negotiation_flag, required_cert, display_order, is_active
    )
    values (
      null, 'VISIT', '기본 출장비', '배정 활성화를 위한 필수 선결제 금액', 50000, 50000, 50000, null,
      true, false, false, 5, 0, false, null, 1, true
    );
  end if;

  -- 2) 정밀 누전 점검 (repair)
  update public.service_items
  set
    service_type = 'LEAKAGE',
    description = '특허 기반 디지털 보증서 발급 포함',
    min_fee = 250000,
    max_fee = 400000,
    unit_price = null,
    surcharge_flag = true,
    is_active = true,
    display_order = 2
  where apt_id is null and name = '정밀 누전 점검';

  if not exists (
    select 1 from public.service_items where apt_id is null and name = '정밀 누전 점검'
  ) then
    insert into public.service_items (
      apt_id, service_type, name, description, min_fee, max_fee, unit_price,
      deductible_flag, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, negotiation_flag, required_cert, display_order, is_active
    )
    values (
      null, 'LEAKAGE', '정밀 누전 점검', '특허 기반 디지털 보증서 발급 포함', 250000, 400000, null,
      false, true, false, 5, 0, false, '전기공사기사', 2, true
    );
  end if;

  -- 3) 차단기 교체 (replacement)
  update public.service_items
  set
    service_type = 'BREAKER',
    description = '국산 정격 차단기 및 공임 포함',
    min_fee = 80000,
    max_fee = 80000,
    unit_price = 80000,
    is_active = true,
    display_order = 3
  where apt_id is null and name = '차단기 교체';

  if not exists (
    select 1 from public.service_items where apt_id is null and name = '차단기 교체'
  ) then
    insert into public.service_items (
      apt_id, service_type, name, description, min_fee, max_fee, unit_price,
      deductible_flag, surcharge_flag, bulk_discount_flag, bulk_threshold, bulk_discount_rate, negotiation_flag, required_cert, display_order, is_active
    )
    values (
      null, 'BREAKER', '차단기 교체', '국산 정격 차단기 및 공임 포함', 80000, 80000, 80000,
      false, false, false, 5, 0, false, null, 3, true
    );
  end if;
end $$;

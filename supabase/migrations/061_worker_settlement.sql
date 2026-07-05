-- 기사 수당 정산 기능 — 지금까지 workers.hourly_rate/daily_rate는 참고용 숫자일 뿐이었고,
-- worker_assignments 테이블(pay_amount 포함)은 이걸 쓰는 화면/API가 전혀 없는 죽은 코드였다.
-- expenses에도 "인건비" 분류 자체가 없어 지급 내역을 남길 곳이 없었다.

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check
  CHECK (category IN ('재료비','공구/장비','교통비','통신비','광고비','인건비','기타'));

-- 완료된 작업 1건에 대한 기사 수당 지급을 worker_assignments + expenses(인건비) 양쪽에
-- 한 번에 원자적으로 기록한다. worker_assignments.reservation_id는 이미 UNIQUE(reservation_id,
-- worker_id) 제약이 있어 같은 건 중복 정산은 이 함수 호출 자체가 실패한다(그대로 위로 전파).
CREATE OR REPLACE FUNCTION public.settle_worker_assignment(
  p_reservation_id uuid,
  p_worker_id uuid,
  p_pay_amount integer,
  p_note text,
  p_expense_date date,
  p_expense_description text
) RETURNS TABLE(assignment_id uuid, expense_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_assignment_id uuid;
  v_expense_id uuid;
BEGIN
  INSERT INTO public.worker_assignments (reservation_id, worker_id, pay_amount, note, completed_at)
  VALUES (p_reservation_id, p_worker_id, p_pay_amount, p_note, now())
  RETURNING id INTO v_assignment_id;

  INSERT INTO public.expenses (category, amount, description, expense_date, payment_method, reservation_id)
  VALUES ('인건비', p_pay_amount, p_expense_description, p_expense_date, '계좌이체', p_reservation_id)
  RETURNING id INTO v_expense_id;

  RETURN QUERY SELECT v_assignment_id, v_expense_id;
END;
$$;

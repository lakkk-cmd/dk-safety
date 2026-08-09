-- financial_ledger는 orders/expenses INSERT/UPDATE 시점에 트리거로 자동 기장되지만
-- (migration 085), 반대 방향인 "원본 행이 삭제됐을 때 원장 항목도 같이 지운다"는 처리가
-- 전혀 없었다. financial_ledger.source_id는 source_type에 따라 orders 또는 expenses를
-- 가리키는 다형(polymorphic) 참조라 일반 FK+ON DELETE CASCADE를 걸 수 없어서, 지금까지
-- 아무 자동 정리가 없었던 것 — 지운 예약/주문/경비의 매출·지출 기록이 원장에 영구적으로
-- 유령으로 남는 구조적 결함이었다.
--
-- 2026-08-09 실제로 이 결함이 두 차례 터졌다: (1) 추영선 고객의 중복 order 버그를 고치며
-- 중복 order를 지웠지만 그 order가 이미 만들어 둔 "예약금 결제" 원장 항목(150,000원)은
-- 그대로 남았고, (2) 이번 세션에서 만든 여러 테스트 예약/주문을 검증 후 삭제했는데 그
-- 원장 항목들(총 607,000원)도 마찬가지로 남아, 총계정원장 매출 합계가 실제(1,152,000원)
-- 보다 757,000원 더 많은 1,909,000원으로 표시되는 결과로 이어졌다.
--
-- 재발을 막기 위해 반대 방향 트리거를 추가한다: orders/expenses가 삭제되면 해당 소스를
-- 참조하던 financial_ledger 행도 함께 삭제된다.

CREATE OR REPLACE FUNCTION public.trg_order_delete_ledger_cleanup() RETURNS trigger AS $$
BEGIN
  BEGIN
    DELETE FROM public.financial_ledger
    WHERE source_type IN ('order_payment', 'order_final_settlement', 'refund')
      AND source_id = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'financial_ledger order 삭제 정리 실패(무시하고 계속): %', SQLERRM;
  END;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_delete_ledger_cleanup ON public.orders;
CREATE TRIGGER order_delete_ledger_cleanup BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_delete_ledger_cleanup();

CREATE OR REPLACE FUNCTION public.trg_expense_delete_ledger_cleanup() RETURNS trigger AS $$
BEGIN
  BEGIN
    DELETE FROM public.financial_ledger
    WHERE source_type = 'expense'
      AND source_id = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'financial_ledger expense 삭제 정리 실패(무시하고 계속): %', SQLERRM;
  END;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expense_delete_ledger_cleanup ON public.expenses;
CREATE TRIGGER expense_delete_ledger_cleanup BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trg_expense_delete_ledger_cleanup();

-- 소급 정리: 이미 원본이 삭제되어 유령으로 남아있는 기존 원장 항목을 제거한다.
DELETE FROM public.financial_ledger fl
WHERE fl.source_type IN ('order_payment', 'order_final_settlement', 'refund')
  AND fl.source_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = fl.source_id);

DELETE FROM public.financial_ledger fl
WHERE fl.source_type = 'expense'
  AND fl.source_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = fl.source_id);

-- 085: 단순 수입/지출 원장(financial_ledger) + 거래처(vendors) + 예산(budgets)
-- 회계 방식은 정식 복식부기가 아니라 부호 있는 금액 하나로 표현하는 단순 원장(대표님 확인 후 진행).
-- expenses/orders 기존 코드는 전혀 건드리지 않고 트리거로만 자동 기장한다 — 트리거 실패도
-- EXCEPTION으로 흡수해 원본 결제/경비 트랜잭션을 절대 막지 않는다.

CREATE TABLE IF NOT EXISTS public.financial_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date     DATE NOT NULL,
  category       TEXT NOT NULL,
  amount         INTEGER NOT NULL,
  description    TEXT,
  source_type    TEXT NOT NULL CHECK (source_type IN ('order_payment','order_final_settlement','expense','refund','manual')),
  source_id      UUID,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  vendor_id      UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_ledger_source_uidx
  ON public.financial_ledger (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_ledger_date ON public.financial_ledger (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_reservation ON public.financial_ledger (reservation_id);

-- 매입 거래처
CREATE TABLE IF NOT EXISTS public.vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  business_number TEXT,
  phone           TEXT,
  category        TEXT,
  note            TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_ledger
  ADD CONSTRAINT financial_ledger_vendor_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL;

-- 예산관리
CREATE TABLE IF NOT EXISTS public.budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month          TEXT NOT NULL,
  category       TEXT NOT NULL,
  planned_amount INTEGER NOT NULL CHECK (planned_amount >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, category)
);

-- ── 자동 기장 트리거 ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_expense_to_ledger() RETURNS trigger AS $$
BEGIN
  BEGIN
    INSERT INTO public.financial_ledger (entry_date, category, amount, description, source_type, source_id, reservation_id, vendor_id)
    VALUES (NEW.expense_date, NEW.category, -NEW.amount, NEW.description, 'expense', NEW.id, NEW.reservation_id, NEW.vendor_id)
    ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'financial_ledger expense 기장 실패(무시하고 계속): %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expense_to_ledger ON public.expenses;
CREATE TRIGGER expense_to_ledger AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.trg_expense_to_ledger();

CREATE OR REPLACE FUNCTION public.trg_order_to_ledger() RETURNS trigger AS $$
BEGIN
  BEGIN
    IF NEW.payment_status = 'PAID' AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
      INSERT INTO public.financial_ledger (entry_date, category, amount, description, source_type, source_id, reservation_id)
      VALUES (CURRENT_DATE, '매출', COALESCE(NEW.base_fee, 0), '예약금 결제', 'order_payment', NEW.id, NEW.reservation_id)
      ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
    END IF;
    IF NEW.final_payment_status = 'PAID' AND (OLD.final_payment_status IS DISTINCT FROM NEW.final_payment_status) THEN
      INSERT INTO public.financial_ledger (entry_date, category, amount, description, source_type, source_id, reservation_id)
      VALUES (
        CURRENT_DATE, '매출',
        GREATEST(0, COALESCE(NEW.total_final_fee, 0) - COALESCE(NEW.base_fee, 0)),
        '현장 정산 잔금', 'order_final_settlement', NEW.id, NEW.reservation_id
      )
      ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
    END IF;
    IF NEW.manual_refund_completed_at IS NOT NULL AND OLD.manual_refund_completed_at IS NULL THEN
      INSERT INTO public.financial_ledger (entry_date, category, amount, description, source_type, source_id, reservation_id)
      VALUES (CURRENT_DATE, '환불', -COALESCE(NEW.manual_refund_amount, 0), '수기 환불 완료', 'refund', NEW.id, NEW.reservation_id)
      ON CONFLICT (source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'financial_ledger order 기장 실패(무시하고 계속): %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_to_ledger ON public.orders;
CREATE TRIGGER order_to_ledger AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_to_ledger();

-- RLS
ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets          ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='financial_ledger' AND policyname='service_all') THEN
    CREATE POLICY "service_all" ON public.financial_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='vendors' AND policyname='service_all') THEN
    CREATE POLICY "service_all" ON public.vendors FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='budgets' AND policyname='service_all') THEN
    CREATE POLICY "service_all" ON public.budgets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

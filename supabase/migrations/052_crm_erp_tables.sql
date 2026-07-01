-- 052: CRM + ERP 통합 테이블
-- workers 기존 테이블 확장 (type/specialty/rate/note)
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS worker_type TEXT NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS specialty  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hourly_rate INTEGER,
  ADD COLUMN IF NOT EXISTS daily_rate  INTEGER,
  ADD COLUMN IF NOT EXISTS worker_note TEXT;

ALTER TABLE public.workers
  DROP CONSTRAINT IF EXISTS workers_worker_type_check;
ALTER TABLE public.workers
  ADD CONSTRAINT workers_worker_type_check
    CHECK (worker_type IN ('employee', 'contractor'));

-- 상담 로그
CREATE TABLE IF NOT EXISTS public.consultation_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT        NOT NULL,
  customer_name  TEXT        NOT NULL,
  channel        TEXT        NOT NULL DEFAULT 'phone'
                   CHECK (channel IN ('phone','kakao','visit','sms')),
  content        TEXT        NOT NULL,
  next_contact_at TIMESTAMPTZ,
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','resolved','follow_up')),
  result         TEXT,
  worker_id      UUID        REFERENCES public.workers(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 경비
CREATE TABLE IF NOT EXISTS public.expenses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category       TEXT        NOT NULL
                   CHECK (category IN ('재료비','공구/장비','교통비','통신비','광고비','기타')),
  subcategory    TEXT,
  amount         INTEGER     NOT NULL CHECK (amount > 0),
  description    TEXT,
  receipt_url    TEXT,
  expense_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT        NOT NULL DEFAULT '카드'
                   CHECK (payment_method IN ('카드','현금','계좌이체')),
  reservation_id UUID        REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 견적서/영수증/세금계산서
CREATE TABLE IF NOT EXISTS public.invoices (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number          TEXT        NOT NULL UNIQUE,
  customer_name           TEXT        NOT NULL,
  customer_phone          TEXT,
  customer_business_number TEXT,
  customer_address        TEXT,
  items                   JSONB       NOT NULL DEFAULT '[]',
  subtotal                INTEGER     NOT NULL DEFAULT 0,
  tax                     INTEGER     NOT NULL DEFAULT 0,
  total                   INTEGER     NOT NULL DEFAULT 0,
  type                    TEXT        NOT NULL DEFAULT 'receipt'
                            CHECK (type IN ('tax_invoice','receipt','quote')),
  status                  TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','sent','paid','cancelled')),
  issued_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at                  TIMESTAMPTZ,
  reservation_id          UUID        REFERENCES public.reservations(id) ON DELETE SET NULL,
  pdf_url                 TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 작업자 배정
CREATE TABLE IF NOT EXISTS public.worker_assignments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  worker_id      UUID        NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  pay_amount     INTEGER,
  note           TEXT,
  UNIQUE (reservation_id, worker_id)
);

-- 재상담 알림
CREATE TABLE IF NOT EXISTS public.follow_up_reminders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID        REFERENCES public.consultation_logs(id) ON DELETE CASCADE,
  customer_name   TEXT        NOT NULL,
  customer_phone  TEXT        NOT NULL,
  remind_at       TIMESTAMPTZ NOT NULL,
  message         TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','skipped')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_consultation_phone  ON public.consultation_logs(customer_phone);
CREATE INDEX IF NOT EXISTS idx_consultation_created ON public.consultation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_number      ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status      ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_assignments_res      ON public.worker_assignments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_remind_at  ON public.follow_up_reminders(remind_at, status);

-- RLS
ALTER TABLE public.consultation_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_all" ON public.consultation_logs   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON public.expenses            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON public.invoices            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON public.worker_assignments  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON public.follow_up_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);

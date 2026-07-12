-- 작업비 난이도 정액표 — 출장비/작업비/재료비 3단계 요금 체계 중 "작업비" 부분.
-- 난이도(하/중/상)별 소요시간 상한과 정액 공임을 관리자 화면에서 추가/수정/삭제할 수 있게 한다.
-- 3시간 초과 건은 카탈로그 행이 아니라 현장에서 기사 재량으로 직접 입력한다(코드에서 별도 처리).
CREATE TABLE IF NOT EXISTS public.labor_tier_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  max_minutes   INTEGER NOT NULL,
  amount        INTEGER NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labor_tier_catalog_active_idx
  ON public.labor_tier_catalog(active, display_order);

ALTER TABLE public.labor_tier_catalog ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_labor_tier_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_labor_tier_catalog_updated_at ON public.labor_tier_catalog;
CREATE TRIGGER trg_labor_tier_catalog_updated_at
  BEFORE UPDATE ON public.labor_tier_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_labor_tier_catalog_updated_at();

-- 초기 협의 단가 (2026-07-12 대표님과 논의해 확정) — 테이블이 비어있을 때만 삽입(재실행 안전)
INSERT INTO public.labor_tier_catalog (label, max_minutes, amount, display_order)
SELECT * FROM (VALUES
  ('하 (30분 이내)', 30, 50000, 1),
  ('하 (1시간 이내)', 60, 100000, 2),
  ('중 (2시간 이내)', 120, 200000, 3),
  ('상 (3시간 이내)', 180, 300000, 4)
) AS t(label, max_minutes, amount, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.labor_tier_catalog);

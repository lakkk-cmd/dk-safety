-- 재료비 정액 카탈로그 — 대표님과 논의해 확정한 출장비/작업비/재료비 3단계 요금 체계 중
-- "재료비" 부분. 품목별 정액가를 관리자 화면에서 추가/수정/삭제할 수 있게 한다.
CREATE TABLE IF NOT EXISTS public.material_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  unit_price    INTEGER NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_catalog_active_idx
  ON public.material_catalog(active, display_order);

ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_material_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_catalog_updated_at ON public.material_catalog;
CREATE TRIGGER trg_material_catalog_updated_at
  BEFORE UPDATE ON public.material_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_material_catalog_updated_at();

-- 초기 협의 단가 (2026-07-12 대표님과 논의해 확정) — 테이블이 비어있을 때만 삽입(재실행 안전)
INSERT INTO public.material_catalog (name, unit_price, display_order)
SELECT * FROM (VALUES
  ('콘센트 (일반 매입형)', 7000, 1),
  ('콘센트 (접지형/방수형)', 12000, 2),
  ('스위치 (단일)', 7000, 3),
  ('스위치 (3로 등 복합)', 13000, 4),
  ('LED 전등기구 (소형 방등)', 30000, 5),
  ('LED 전등기구 (대형 직부등)', 50000, 6),
  ('센서등', 35000, 7),
  ('배선용 차단기 (일반)', 20000, 8),
  ('누전차단기', 40000, 9),
  ('전선', 100000, 10)
) AS t(name, unit_price, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.material_catalog);

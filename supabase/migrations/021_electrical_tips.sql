-- 021: 생활전기정보 (Electrical Tips) 테이블 — 대경안심전기 중앙 관리
CREATE TABLE IF NOT EXISTS public.electrical_tips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL DEFAULT 'safety',
  -- 카테고리: 'safety'(안전), 'saving'(절약), 'selfcheck'(자가점검), 'seasonal'(계절별)
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL,          -- 카드 미리보기 (2줄 이내)
  content      TEXT NOT NULL,          -- 본문 (마크다운 허용)
  image_url    TEXT,                   -- 대표 이미지 URL (Supabase Storage)
  service_type TEXT,                   -- 연결 서비스 유형 (예: 'LEAKAGE') — null이면 연결 없음
  is_published BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT electrical_tips_category_chk CHECK (
    category IN ('safety', 'saving', 'selfcheck', 'seasonal')
  )
);

CREATE INDEX IF NOT EXISTS electrical_tips_published_idx
  ON public.electrical_tips(is_published, display_order);

-- 입주민: 발행된 콘텐츠만 공개 읽기
ALTER TABLE public.electrical_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY electrical_tips_public_read
  ON public.electrical_tips FOR SELECT
  USING (is_published = true);

CREATE POLICY electrical_tips_admin_all
  ON public.electrical_tips FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.update_electrical_tips_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_electrical_tips_updated_at
  BEFORE UPDATE ON public.electrical_tips
  FOR EACH ROW
  execute function public.update_electrical_tips_updated_at();

-- 초기 샘플 데이터 3건
INSERT INTO public.electrical_tips
  (category, title, summary, content, service_type, is_published, display_order)
VALUES
(
  'safety',
  '차단기가 자꾸 내려간다면?',
  '차단기가 반복적으로 내려가는 건 단순한 불편이 아닙니다. 화재 위험 신호일 수 있어요.',
  '## 차단기가 자꾸 내려간다면?

차단기(두꺼비집)가 반복적으로 내려가는 현상은 **과부하 또는 누전**의 신호입니다.

### 즉시 확인해야 할 것들
- 한 콘센트에 멀티탭을 여러 개 연결하고 있지는 않나요?
- 에어컨, 전기밥솥, 전자레인지를 동시에 사용하고 있나요?
- 차단기를 올려도 바로 다시 내려간다면 **즉시 전문가 점검**이 필요합니다.

### 방치하면 생기는 위험
전선 과열 → 절연 피복 손상 → 누전 → **화재**

차단기가 3회 이상 반복해서 내려간다면 스스로 해결하려 하지 마시고 전문가에게 연락하세요.',
  'DIAGNOSIS',
  true,
  1
),
(
  'selfcheck',
  '콘센트에서 타는 냄새가 날 때',
  '콘센트의 타는 냄새는 절대 그냥 넘기면 안 됩니다. 즉각 조치 방법을 알아보세요.',
  '## 콘센트에서 타는 냄새가 날 때

탄 냄새가 난다는 것은 **이미 과열이 시작됐다는 의미**입니다.

### 즉각 조치 방법
1. 해당 콘센트에 꽂힌 플러그를 **즉시 뽑으세요**
2. 분전반에서 해당 구역 차단기를 내리세요
3. 콘센트 커버를 열어보지 마세요 — 전문가에게 맡기세요

### 절대 하면 안 되는 것
- 물을 뿌리는 행위
- 냄새가 사라졌다고 그냥 사용 재개

전기 화재의 40% 이상이 콘센트·배선 문제에서 시작됩니다.',
  'OUTLET',
  true,
  2
),
(
  'saving',
  '전기요금 20% 줄이는 생활 습관',
  '작은 습관 하나가 한 달 전기요금을 수만 원 아껴줍니다.',
  '## 전기요금 20% 줄이는 생활 습관

### 대기전력 차단
TV, 셋톱박스, 충전기 등의 **대기전력**은 전체 전기 사용량의 약 11%를 차지합니다.
멀티탭 스위치를 활용해 사용하지 않을 때는 완전히 차단하세요.

### 냉장고 관리
- 냉장실 60~70% 채우기 (공기 순환 필요)
- 뜨거운 음식은 식힌 후 냉장 보관
- 문 고무패킹 틈새 확인 — 헐거우면 냉기 손실 20% 증가

### 에어컨 효율화
- 희망온도 26°C 유지 (1°C 낮출 때마다 전력 7% 증가)
- 필터 2주마다 청소 — 막힌 필터는 전력 15% 더 소비

### 조명
- LED 교체만으로 기존 형광등 대비 전력 50% 절감',
  NULL,
  true,
  3
);

-- 카카오 카드뉴스 자동생성 파이프라인 (2026-09-07)
-- 카드뉴스는 AI 이미지 생성이 아니라 satori(next/og) HTML→PNG 렌더링으로 만든다(비용 0원,
-- 브랜드 룩북 디자인 그대로 코드화). card_news_slides에 슬라이드 텍스트를 남겨두는 이유는
-- 이미지 재생성(폰트/레이아웃 수정 후 다시 찍어내기) 시 Claude를 다시 호출하지 않기 위함.

ALTER TABLE public.content_kakao_queue
  ADD COLUMN IF NOT EXISTS card_news_slides JSONB,
  ADD COLUMN IF NOT EXISTS card_news_images TEXT[];

COMMENT ON COLUMN public.content_kakao_queue.card_news_slides IS
  '카드뉴스 슬라이드 기획 텍스트(JSON 배열: cover/step/cta) — planCardNewsSlides() 산출물, 재렌더링용';
COMMENT ON COLUMN public.content_kakao_queue.card_news_images IS
  '카드뉴스 PNG 공개 URL 배열(순서=슬라이드 순서) — Supabase Storage(dk-safety-video-assets)';

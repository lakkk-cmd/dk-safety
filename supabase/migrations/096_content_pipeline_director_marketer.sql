-- 096: 콘텐츠 파이프라인을 디렉터→마케터→워커 순차 위임 구조로 재편 (Phase 1)
--
-- 배경: "디렉터 파이프라인" 재편 제안(2026-08-17) Phase 1. 지금까지 content-agents.ts의
-- buildPlanningSystemPrompt()는 CMO/CSO/CLO/유튜브PD/카카오매니저/블로그에디터를 한 번의
-- Claude 호출 안에서 동시에 응답시켰다 — 마케터(CMO)의 가이드라인이 워커의 실제 입력이
-- 되는 핸드오프가 존재하지 않았다. 이 마이그레이션은 디렉터가 정리한 브리핑과 CMO가 작성한
-- 제작 가이드라인을 실제 데이터로 저장해, 워커 단계에서 그 값을 읽어 쓰도록 한다.

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS director_brief TEXT,
  ADD COLUMN IF NOT EXISTS marketer_guideline TEXT;

ALTER TABLE public.content_kakao_queue
  ADD COLUMN IF NOT EXISTS director_brief TEXT,
  ADD COLUMN IF NOT EXISTS marketer_guideline TEXT;

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS director_brief TEXT,
  ADD COLUMN IF NOT EXISTS marketer_guideline TEXT;

COMMENT ON COLUMN public.content_youtube_queue.director_brief IS '총괄디렉터가 정리한 이번 주 우선순위/제약 (JSON 텍스트, CSO+CLO 자문 종합)';
COMMENT ON COLUMN public.content_youtube_queue.marketer_guideline IS 'CMO 확성기가 작성한 제작 가이드라인 — 유튜브PD(워커)의 실제 입력값 (JSON 텍스트)';
COMMENT ON COLUMN public.content_kakao_queue.director_brief IS '총괄디렉터가 정리한 이번 주 우선순위/제약 (JSON 텍스트, CSO+CLO 자문 종합)';
COMMENT ON COLUMN public.content_kakao_queue.marketer_guideline IS 'CMO 확성기가 작성한 제작 가이드라인 — 카카오매니저(워커)의 실제 입력값 (JSON 텍스트)';
COMMENT ON COLUMN public.blog_posts.director_brief IS '총괄디렉터가 정리한 이번 주 우선순위/제약 (JSON 텍스트, CSO+CLO 자문 종합)';
COMMENT ON COLUMN public.blog_posts.marketer_guideline IS 'CMO 확성기가 작성한 제작 가이드라인 — 블로그에디터(워커)의 실제 입력값 (JSON 텍스트)';

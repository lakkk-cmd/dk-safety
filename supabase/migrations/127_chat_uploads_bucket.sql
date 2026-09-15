-- hq 채팅 첨부파일 업로드 API(src/app/api/admin/chat/upload/route.ts,
-- src/app/api/admin/chat/upload-sign/route.ts)가 실제로 사용하는 'chat-uploads'
-- Storage 버킷이 어떤 마이그레이션에도, storage:ensure(scripts/ensure-supabase-storage.mjs)
-- 에도 없었다. dev Supabase 분리 2단계에서 운영과 dev의 버킷 목록을 대조하다가 발견했다
-- (2026-09-16) — site_decisions/site_config(테이블), apartments.apt_name(컬럼)에 이어
-- 운영에만 마이그레이션 밖에서 직접 만들어진 객체의 네 번째 사례, Storage 계층에서는
-- 처음이다.
--
-- 아래 설정값은 운영 실제 값을 그대로 옮긴 것이다(대표님이 SQL Editor로 직접 조회,
-- 2026-09-16): public=true, file_size_limit=20971520(20MB), allowed_mime_types=제한 없음.
--
-- 063_video_jobs.sql/064_blog_jobs.sql이 쓰는 것과 같은 패턴(storage.buckets에 SQL로
-- 직접 INSERT)을 그대로 따른다 — 새 방식을 만들지 않고 기존 관례를 따르는 것이라
-- 위험이 낮다. ON CONFLICT (id) DO UPDATE는 운영에서도 매번 실행되지만 같은 값으로
-- 덮어쓸 뿐이라 실질적으로 no-op이다 — 오히려 설정이 나중에 다른 경로로 바뀌어도 이
-- 마이그레이션이 재적용될 때마다 운영이 원래 의도한 값으로 되돌아가는 효과가 있다.
--
-- ★버킷 이름은 SUPABASE_CHAT_UPLOAD_BUCKET 환경변수로 바꿀 수 있는 구조다(위 두 라우트
-- 파일 모두 `process.env.SUPABASE_CHAT_UPLOAD_BUCKET ?? "chat-uploads"`). 이 마이그레이션은
-- 063/064와 같은 방식으로 고정 문자열 'chat-uploads'를 쓴다 — 어느 환경에서
-- SUPABASE_CHAT_UPLOAD_BUCKET을 다른 이름으로 설정하면 코드는 그 다른 이름의 버킷을
-- 찾으려 하고, 이 마이그레이션이 만드는 'chat-uploads'는 실제로 쓰이지 않게 된다
-- (환경변수 미설정 시에만 이 버킷이 실제로 사용됨). 063의 'videos'/064의 'blog-assets'도
-- 이미 같은 구조적 한계를 갖고 있어 이번에 새로 생기는 문제는 아니다.
--
-- ★063/064와 달리 storage.objects에 대한 public-read RLS 정책은 추가하지 않았다.
-- upload-sign은 서명 URL 발급(service role이라 RLS 우회)이고 upload는 공개 URL을
-- fetch하는데, 공개 URL 서빙은 버킷의 public 플래그 자체로 동작하고 storage.objects
-- RLS를 거치지 않는 것으로 보여 정책이 기능에 필요해 보이지 않는다. 운영에 실제로
-- 이런 정책이 있는지는 확인하지 않았다 — 추측으로 추가하지 않았다. 필요하다고
-- 판단되면 별도 확인 후 추가한다.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-uploads', 'chat-uploads', true, 20971520)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 20971520;

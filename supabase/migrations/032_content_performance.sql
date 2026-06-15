-- 4단계: 콘텐츠 성과 자가학습 피드백 루프

ALTER TABLE public.content_youtube_queue
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stats_updated_at TIMESTAMPTZ;

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_blog_view(p_slug text)
RETURNS void AS $$
  UPDATE public.blog_posts SET view_count = view_count + 1
  WHERE slug = p_slug AND status = 'published';
$$ LANGUAGE sql;

COMMENT ON COLUMN public.content_youtube_queue.view_count IS '유튜브 영상 조회수 (성과 리뷰 크론이 주기적으로 갱신)';
COMMENT ON COLUMN public.content_youtube_queue.like_count IS '유튜브 영상 좋아요 수';
COMMENT ON COLUMN public.content_youtube_queue.comment_count IS '유튜브 영상 댓글 수';
COMMENT ON COLUMN public.content_youtube_queue.stats_updated_at IS '유튜브 통계 마지막 갱신 시각';
COMMENT ON COLUMN public.blog_posts.view_count IS '블로그 글 조회수 (공개 페이지 방문 시 increment_blog_view로 증가)';

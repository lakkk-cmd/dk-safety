-- 채팅 첨부파일 URL 컬럼 추가
ALTER TABLE public.agent_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN public.agent_chat_messages.attachment_url IS '첨부 파일/이미지 Supabase Storage 공개 URL';

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });

async function main() {
  // 카카오 CHECK 제약 갱신 (draft, pending 추가)
  await sql`ALTER TABLE public.content_kakao_queue DROP CONSTRAINT IF EXISTS content_kakao_queue_status_check`;
  await sql`ALTER TABLE public.content_kakao_queue ADD CONSTRAINT content_kakao_queue_status_check
    CHECK (status IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'published'))`;
  console.log('✅ content_kakao_queue 제약 갱신 완료');

  // 유튜브 CHECK 제약 갱신 (draft, pending 추가)
  await sql`ALTER TABLE public.content_youtube_queue DROP CONSTRAINT IF EXISTS content_youtube_queue_status_check`;
  await sql`ALTER TABLE public.content_youtube_queue ADD CONSTRAINT content_youtube_queue_status_check
    CHECK (status IN ('planning', 'draft', 'pending', 'pending_approval', 'approved', 'rejected', 'uploaded', 'producing', 'assets_ready'))`;
  console.log('✅ content_youtube_queue 제약 갱신 완료');

  await sql.end({ timeout: 5 });
}

main().catch(console.error);

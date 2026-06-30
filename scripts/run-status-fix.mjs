import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });

async function main() {
  // 1. 카카오 중복 삭제
  const del = await sql`
    DELETE FROM content_kakao_queue
    WHERE id = '7bcb200d-b7b6-4ef0-8580-e54191731f41'
    RETURNING id
  `;
  console.log(`✅ 카카오 중복 삭제: ${del.length}건`);

  // 2. 카카오 planning → draft
  const kakaoUpd = await sql`
    UPDATE content_kakao_queue
    SET status = 'draft', updated_at = NOW()
    WHERE status = 'planning'
    RETURNING id
  `;
  console.log(`✅ 카카오 planning→draft: ${kakaoUpd.length}건`);

  // 3. 유튜브 planning → draft
  const ytUpd = await sql`
    UPDATE content_youtube_queue
    SET status = 'draft', updated_at = NOW()
    WHERE status = 'planning'
    RETURNING id
  `;
  console.log(`✅ 유튜브 planning→draft: ${ytUpd.length}건`);

  // 4. 결과 확인
  console.log('\n── 결과 확인 ──────────────────────────');

  const kakaoStats = await sql`
    SELECT status, COUNT(*)::int as cnt FROM content_kakao_queue GROUP BY status ORDER BY status
  `;
  console.log('카카오:', Object.fromEntries(kakaoStats.map(r => [r.status, r.cnt])));

  const ytStats = await sql`
    SELECT status, COUNT(*)::int as cnt FROM content_youtube_queue GROUP BY status ORDER BY status
  `;
  console.log('유튜브:', Object.fromEntries(ytStats.map(r => [r.status, r.cnt])));

  const blogStats = await sql`
    SELECT status, COUNT(*)::int as cnt FROM blog_posts GROUP BY status ORDER BY status
  `;
  console.log('블로그:', Object.fromEntries(blogStats.map(r => [r.status, r.cnt])));

  await sql.end({ timeout: 5 });
}

main().catch(console.error);

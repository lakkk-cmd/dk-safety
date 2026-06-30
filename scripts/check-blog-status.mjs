import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });
const rows = await sql`SELECT status, COUNT(*)::int as cnt FROM blog_posts GROUP BY status ORDER BY status`;
console.log('blog_posts status 분포:');
for (const r of rows) console.log(` ${r.status}: ${r.cnt}건`);
await sql.end({ timeout: 5 });

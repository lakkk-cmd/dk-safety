import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });

async function main() {
  const migration = readFileSync(new URL('../supabase/migrations/050_walk_in_reservations.sql', import.meta.url), 'utf8');
  await sql.unsafe(migration);
  console.log('✅ migration 050 적용 완료');
  await sql.end({ timeout: 5 });
}

main().catch((err) => { console.error('❌', err.message); process.exit(1); });

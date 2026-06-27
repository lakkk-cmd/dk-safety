import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

async function embedQuery(query: string): Promise<number[]> {
  const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
  if (!VOYAGE_API_KEY) throw new Error('VOYAGE_API_KEY 없음');

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: [query],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Voyage AI 쿼리 임베딩 실패: ${errText}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const body = await req.json();
    const query: string = body?.query;
    const limit: number = body?.limit ?? 5;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: 'query 파라미터가 필요합니다.' }, { status: 400 });
    }

    const embedding = await embedQuery(query.trim());

    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_count: limit,
    });

    if (error) {
      throw new Error(`match_chunks RPC 오류: ${error.message}`);
    }

    return NextResponse.json({ results: data ?? [] });
  } catch (err) {
    console.error('[/api/knowledge/search] 오류:', err);
    return NextResponse.json(
      { error: (err as Error).message ?? '알 수 없는 오류' },
      { status: 500 }
    );
  }
}

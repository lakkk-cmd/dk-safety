import { NextRequest, NextResponse } from 'next/server';
import { runTavilySearch, runFirecrawl } from '@/lib/web-learn';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.AGENT_WRITE_SECRET}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const mode = body?.mode ?? 'both'; // 'tavily' | 'firecrawl' | 'both'
    const category: string | undefined = body?.category; // undefined = 전체

    const results: Record<string, unknown> = {};

    if (mode === 'tavily' || mode === 'both') {
      console.log(`[web-learn] Tavily 검색 시작${category ? ` (${category})` : ''}...`);
      results.tavily = await runTavilySearch(category);
    }

    if (mode === 'firecrawl' || mode === 'both') {
      console.log(`[web-learn] Firecrawl 크롤링 시작${category ? ` (${category})` : ''}...`);
      results.firecrawl = await runFirecrawl(category);
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[/api/knowledge/web-learn] 오류:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

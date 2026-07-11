import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/admin-auth';
import { requireAgentSupabase } from '@/lib/agent-db';
import { runTavilySearch, runFirecrawl } from '@/lib/web-learn';

export const runtime = 'nodejs';
export const maxDuration = 300;

function parseSourceFile(sf: string): { type: 'pdf' | 'tavily' | 'firecrawl'; category: string; label: string } {
  if (sf.startsWith('web:tavily:')) {
    const parts = sf.split(':');
    return { type: 'tavily', category: parts[2] ?? '기타', label: parts[4] ?? sf };
  }
  if (sf.startsWith('web:firecrawl:')) {
    const parts = sf.split(':');
    return { type: 'firecrawl', category: parts[2] ?? '기타', label: parts[3] ?? sf };
  }
  return { type: 'pdf', category: 'PDF', label: sf };
}

// GET: 학습 현황 통계
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  try {
    const supabase = requireAgentSupabase();
    const { data, error } = await supabase
      .from('knowledge')
      .select('source, created_at')
      .not('embedding_voyage', 'is', null)
      .limit(50000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    let pdf = 0, tavily = 0, firecrawl = 0;

    const bySource = new Map<string, { count: number; lastLearned: string }>();
    for (const row of rows) {
      const sf = row.source as string;
      const ca = row.created_at as string;
      if (sf.startsWith('web:tavily:')) tavily++;
      else if (sf.startsWith('web:firecrawl:')) firecrawl++;
      else pdf++;

      const ex = bySource.get(sf);
      if (!ex) {
        bySource.set(sf, { count: 1, lastLearned: ca });
      } else {
        ex.count++;
        if (ca > ex.lastLearned) ex.lastLearned = ca;
      }
    }

    const catMap = new Map<string, { category: string; type: string; chunks: number; lastLearned: string }>();
    const recentList: Array<{ sourceFile: string; chunks: number; type: string; label: string; category: string; lastLearned: string }> = [];

    for (const [sf, { count, lastLearned }] of bySource) {
      const { type, category, label } = parseSourceFile(sf);
      const key = `${type}:${category}`;
      const ex = catMap.get(key);
      if (!ex) {
        catMap.set(key, { category, type, chunks: count, lastLearned });
      } else {
        ex.chunks += count;
        if (lastLearned > ex.lastLearned) ex.lastLearned = lastLearned;
      }
      recentList.push({ sourceFile: sf, chunks: count, type, label, category, lastLearned });
    }

    const categories = [...catMap.values()].sort((a, b) => b.chunks - a.chunks);
    const recent = recentList.sort((a, b) => b.lastLearned.localeCompare(a.lastLearned)).slice(0, 10);

    return NextResponse.json({ total: rows.length, pdf, tavily, firecrawl, categories, recent });
  } catch (err) {
    console.error('[admin/web-learn GET] 오류:', err);
    return NextResponse.json({ error: (err as Error).message ?? '통계 로드 실패' }, { status: 500 });
  }
}

// POST: 웹서치 학습 실행
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  // 환경변수 로드 확인
  const tavilyKey = process.env.TAVILY_API_KEY;
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  console.log('[admin/web-learn POST] TAVILY_API_KEY:', tavilyKey ? `설정됨 (${tavilyKey.slice(0, 6)}...)` : '❌ 미설정');
  console.log('[admin/web-learn POST] FIRECRAWL_API_KEY:', firecrawlKey ? `설정됨 (${firecrawlKey.slice(0, 6)}...)` : '❌ 미설정');

  if (!tavilyKey) {
    return NextResponse.json({ error: 'TAVILY_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }
  if (!firecrawlKey) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({})) as { mode?: string; category?: string };
    const mode = body?.mode ?? 'both';
    const category = body?.category; // undefined = 전체
    const results: Record<string, unknown> = {};

    if (mode === 'tavily' || mode === 'both') {
      console.log(`[admin/web-learn POST] Tavily 검색 시작${category ? ` (${category})` : ''}...`);
      results.tavily = await runTavilySearch(category);
      console.log('[admin/web-learn POST] Tavily 완료:', JSON.stringify(results.tavily));
    }
    if (mode === 'firecrawl' || mode === 'both') {
      console.log(`[admin/web-learn POST] Firecrawl 크롤링 시작${category ? ` (${category})` : ''}...`);
      results.firecrawl = await runFirecrawl(category);
      console.log('[admin/web-learn POST] Firecrawl 완료:', JSON.stringify(results.firecrawl));
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[admin/web-learn POST] 오류:', err);
    return NextResponse.json({ error: (err as Error).message ?? '학습 실행 실패' }, { status: 500 });
  }
}

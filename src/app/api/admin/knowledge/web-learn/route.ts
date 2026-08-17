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
    // source별로 이미 DB에서 GROUP BY 집계된 결과를 받는다(knowledge_stats_by_source RPC,
    // 099 마이그레이션) — raw 행을 fetch해 JS에서 세던 예전 방식은 PostgREST 기본 행 개수
    // 상한(1,000)에 걸려 knowledge 테이블이 그보다 커지면 부정확해졌다(2026-08-17 실사례:
    // 행정업무운영편람 614청크가 21청크로 잘못 표시됨 — 데이터 자체는 정상 저장돼 있었음).
    const { data, error } = await supabase.rpc('knowledge_stats_by_source');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const bySource = (data ?? []) as { source: string; chunk_count: number; last_learned: string }[];
    let total = 0, pdf = 0, tavily = 0, firecrawl = 0;
    const catMap = new Map<string, { category: string; type: string; chunks: number; lastLearned: string }>();
    const recentList: Array<{ sourceFile: string; chunks: number; type: string; label: string; category: string; lastLearned: string }> = [];

    for (const { source: sf, chunk_count: count, last_learned: lastLearned } of bySource) {
      total += count;
      if (sf.startsWith('web:tavily:')) tavily += count;
      else if (sf.startsWith('web:firecrawl:')) firecrawl += count;
      else pdf += count;

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

    return NextResponse.json({ total, pdf, tavily, firecrawl, categories, recent });
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

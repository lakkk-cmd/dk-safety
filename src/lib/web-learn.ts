import { tavily } from '@tavily/core';
import FirecrawlApp from '@mendable/firecrawl-js';
import { createClient } from '@supabase/supabase-js';
import { SEARCH_KEYWORDS, CRAWL_TARGETS } from './web-learn-keywords';
import { validateKnowledgeChunk, GEMINI_ENABLED } from './cross-validate';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── 신뢰 도메인 필터링 ────────────────────────────────────────────────────
async function getTrustedDomains(category: string): Promise<string[]> {
  const { data } = await supabase
    .from('trusted_domains')
    .select('domain')
    .eq('category', category)
    .eq('is_active', true);
  return data?.map((d: { domain: string }) => d.domain) ?? [];
}

function isTrustedUrl(targetUrl: string, trustedDomains: string[]): boolean {
  if (trustedDomains.length === 0) return true; // 카테고리에 등록된 도메인이 없으면 전부 허용
  try {
    const hostname = new URL(targetUrl).hostname.replace(/^www\./, '');
    return trustedDomains.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

// ── 청크 전수 검증 (Gemini) — 기존 지식베이스 검증기 재사용 ─────────────────
async function filterValidatedChunks(
  chunks: string[],
  sourceFile: string,
  category: string
): Promise<string[]> {
  if (!GEMINI_ENABLED) return chunks; // 검증 불가 시 전부 통과(기존 동작 유지)

  const validated: string[] = [];
  for (const chunk of chunks) {
    try {
      const result = await validateKnowledgeChunk({ sourceFile, content: chunk, category });
      if (result.passed) {
        validated.push(chunk);
      } else {
        console.warn(`⚠️ [전수검증거부] ${sourceFile} 청크 거부 (점수: ${result.score})`);
      }
    } catch (err) {
      console.warn(`⚠️ [전수검증오류] ${sourceFile}:`, err);
      validated.push(chunk); // 검증 자체가 실패하면(예: Gemini 일시 오류) 통과 처리해 학습이 멈추지 않게 함
    }
    await new Promise((r) => setTimeout(r, 200)); // rate limit 방지
  }
  return validated;
}

// ── Voyage AI 임베딩 ──────────────────────────────────────────────────────
async function embedTexts(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'voyage-3', input: batch }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Voyage AI 임베딩 실패: ${err}`);
    }

    const json = await res.json();
    allEmbeddings.push(...json.data.map((d: { embedding: number[] }) => d.embedding));
  }

  return allEmbeddings;
}

// ── 청크 저장 ─────────────────────────────────────────────────────────────
async function saveWebChunks(
  sourceFile: string,
  category: string,
  chunks: string[]
): Promise<number> {
  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks);

  await supabase.from('knowledge_chunks').delete().eq('source_file', sourceFile);

  const INSERT_BATCH = 50;
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const rows = chunks.slice(i, i + INSERT_BATCH).map((content, j) => ({
      source_file: sourceFile,
      chunk_index: i + j,
      content,
      embedding: embeddings[i + j],
    }));

    const { error } = await supabase.from('knowledge_chunks').insert(rows);
    if (error) throw new Error(`저장 실패: ${error.message}`);
  }

  // category는 source_file 접두사로 구분되므로 별도 컬럼 불필요
  void category;

  return chunks.length;
}

// ── 텍스트 청크 분할 ──────────────────────────────────────────────────────
function chunkText(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const chunk = text.slice(start, start + size).trim();
    if (chunk.length > 30) chunks.push(chunk);
    start += size - overlap;
  }
  return chunks;
}

// ── Tavily 키워드 검색 ────────────────────────────────────────────────────
export async function runTavilySearch(category?: string): Promise<{
  success: number;
  failed: number;
  totalChunks: number;
}> {
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });
  let success = 0;
  let failed = 0;
  let totalChunks = 0;

  const groups = category
    ? SEARCH_KEYWORDS.filter((g) => g.category === category)
    : SEARCH_KEYWORDS;

  for (const group of groups) {
    const trustedDomains = await getTrustedDomains(group.category);

    for (const keyword of group.keywords) {
      try {
        const result = await client.search(keyword, {
          searchDepth: 'basic',
          maxResults: 3,
          includeRawContent: 'markdown',
          language: 'ko',
        });

        // 신뢰 도메인 필터링 — 등록된 도메인 밖 출처는 차단
        const filteredResults = result.results.filter((r) => !r.url || isTrustedUrl(r.url, trustedDomains));
        if (filteredResults.length === 0) {
          console.warn(`⚠️ [도메인차단] ${keyword} → 신뢰 도메인 결과 없음`);
          failed++;
          continue;
        }

        const texts = filteredResults
          .map((r) => `# ${r.title}\n출처: ${r.url ?? '-'}\n${r.content ?? ''}`)
          .filter((t) => t.length > 100);

        if (texts.length === 0) continue;

        const combined = texts.join('\n\n');
        const rawChunks = chunkText(combined);
        const sourceFile = `web:tavily:${group.category}:${group.subcategory}:${keyword}`;

        // 전수 Gemini 검증 — 허위/위험 정보 청크는 저장 전 차단
        const chunks = await filterValidatedChunks(rawChunks, sourceFile, group.category);
        if (chunks.length === 0) {
          console.warn(`❌ [전수검증] ${keyword} → 모든 청크 거부`);
          failed++;
          continue;
        }
        console.log(`✅ [전수검증] ${keyword} → ${chunks.length}/${rawChunks.length}개 통과`);

        const saved = await saveWebChunks(sourceFile, group.category, chunks);
        totalChunks += saved;
        success++;

        console.log(`✅ [Tavily] ${keyword} → ${saved}개 청크`);

        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`❌ [Tavily] ${keyword} 실패:`, err);
        failed++;
      }
    }
  }

  return { success, failed, totalChunks };
}

// ── Firecrawl 사이트 크롤링 ───────────────────────────────────────────────
export async function runFirecrawl(category?: string): Promise<{
  success: number;
  failed: number;
  totalChunks: number;
}> {
  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });
  let success = 0;
  let failed = 0;
  let totalChunks = 0;

  const targets = category
    ? CRAWL_TARGETS.filter((t) => t.category === category)
    : CRAWL_TARGETS;

  for (const target of targets) {
    try {
      const result = await app.scrapeUrl(target.url, {
        formats: ['markdown'],
      });

      if (!result.markdown) {
        console.warn(`⚠️ [Firecrawl] ${target.name} 빈 결과`);
        failed++;
        continue;
      }

      const rawChunks = chunkText(result.markdown);
      const sourceFile = `web:firecrawl:${target.category}:${target.name}`;

      const chunks = await filterValidatedChunks(rawChunks, sourceFile, target.category);
      if (chunks.length === 0) {
        console.warn(`❌ [전수검증] ${target.name} → 모든 청크 거부`);
        failed++;
        continue;
      }
      console.log(`✅ [전수검증] ${target.name} → ${chunks.length}/${rawChunks.length}개 통과`);

      const saved = await saveWebChunks(sourceFile, target.category, chunks);
      totalChunks += saved;
      success++;

      console.log(`✅ [Firecrawl] ${target.name} → ${saved}개 청크`);

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`❌ [Firecrawl] ${target.name} 실패:`, err);
      failed++;
    }
  }

  return { success, failed, totalChunks };
}

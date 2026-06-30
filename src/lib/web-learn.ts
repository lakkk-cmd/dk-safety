import { tavily } from '@tavily/core';
import FirecrawlApp from '@mendable/firecrawl-js';
import { createClient } from '@supabase/supabase-js';
import { SEARCH_KEYWORDS, CRAWL_TARGETS } from './web-learn-keywords';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    for (const keyword of group.keywords) {
      try {
        const result = await client.search(keyword, {
          searchDepth: 'basic',
          maxResults: 3,
          includeRawContent: 'markdown',
          language: 'ko',
        });

        const texts = result.results
          .map((r) => `# ${r.title}\n${r.content ?? ''}`)
          .filter((t) => t.length > 100);

        if (texts.length === 0) continue;

        const combined = texts.join('\n\n');
        const chunks = chunkText(combined);
        const sourceFile = `web:tavily:${group.category}:${group.subcategory}:${keyword}`;

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

      const chunks = chunkText(result.markdown);
      const sourceFile = `web:firecrawl:${target.category}:${target.name}`;

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

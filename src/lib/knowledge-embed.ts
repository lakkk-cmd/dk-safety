import { createClient } from '@supabase/supabase-js';

// PDF 텍스트 추출은 /api/knowledge/upload에서 knowledge_base/knowledge_chunks 양쪽이
// 공유하도록 한 번만 수행한다(@/lib/pdf-parse-loader의 loadPDFParse 사용) — 이 파일에는
// 청크 분할/Voyage 임베딩/저장만 남긴다.

// ── 1. 청크 분할 ──────────────────────────────────────────────────────────
export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start += chunkSize - overlap;
  }

  return chunks;
}

// ── 3. Voyage AI 임베딩 ───────────────────────────────────────────────────
export async function embedChunks(chunks: string[]): Promise<number[][]> {
  const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  // Voyage API 최대 배치: 128개. 초과 시 분할 처리
  const BATCH_SIZE = 128;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-3',
        input: batch,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Voyage AI 임베딩 실패 (HTTP ${res.status}): ${errText}`);
    }

    const json = await res.json();

    if (!json.data || !Array.isArray(json.data)) {
      throw new Error(`Voyage AI 응답 형식 오류: ${JSON.stringify(json)}`);
    }

    const embeddings: number[][] = json.data.map((item: { embedding: number[] }) => item.embedding);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

// ── 4. Supabase 저장 ──────────────────────────────────────────────────────
export async function saveChunks(
  sourceFile: string,
  chunks: string[],
  embeddings: number[][]
): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error(`청크 수(${chunks.length})와 임베딩 수(${embeddings.length})가 다릅니다.`);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 기존 동일 파일 청크 삭제 (중복 방지)
  const { error: deleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_file', sourceFile);

  if (deleteError) {
    throw new Error(`기존 청크 삭제 실패: ${deleteError.message}`);
  }

  // 새 청크 삽입 (50개씩 배치)
  const INSERT_BATCH = 50;
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const rows = chunks.slice(i, i + INSERT_BATCH).map((content, j) => ({
      source_file: sourceFile,
      chunk_index: i + j,
      content,
      embedding: embeddings[i + j],
    }));

    const { error: insertError } = await supabase
      .from('knowledge_chunks')
      .insert(rows);

    if (insertError) {
      throw new Error(`청크 저장 실패 (배치 ${i}~${i + INSERT_BATCH}): ${insertError.message}`);
    }
  }
}

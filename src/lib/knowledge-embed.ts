import { createClient } from '@supabase/supabase-js';
import { loadPDFParse } from '@/lib/pdf-parse-loader';

// ── Supabase 클라이언트 (서버 전용) ──────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── 1. PDF 텍스트 추출 ────────────────────────────────────────────────────
// 주의: 설치된 pdf-parse는 2.x(PDFParse 클래스 API)이며, 1.x의 `import pdf from 'pdf-parse'`
// 형태(default export 함수)는 제공하지 않는다. 같은 패키지를 쓰는 기존 /admin/knowledge
// 파이프라인과 버전을 분리할 수 없으므로(동일 패키지명은 하나의 버전만 설치 가능) 실제
// 설치된 2.x API로 호출한다. loadPDFParse()는 pdf.js가 Node에서 전역 DOMMatrix를 참조해
// 발생하는 ReferenceError를 막는 폴리필도 함께 적용한다(오늘 /admin/knowledge에서 같은
// 문제를 겪고 고친 것과 동일한 이슈).
export async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const PDFParse = await loadPDFParse();
    const parser = new PDFParse({ data: buffer });
    let text = '';
    let numpages = 0;
    try {
      const data = await parser.getText();
      text = data.text?.trim() ?? '';
      numpages = data.total ?? 0;
    } finally {
      await parser.destroy();
    }

    // 텍스트가 너무 짧으면 이미지 기반 슬라이드 가능성 — 페이지 수 정보라도 반환
    if (text.length < 50) {
      console.warn('[parsePDF] 텍스트 추출 결과가 빈값에 가깝습니다. 이미지 기반 PDF일 수 있습니다.');
      return `[이미지 기반 PDF - 페이지 수: ${numpages}] 텍스트 추출 불가`;
    }
    return text;
  } catch (err) {
    console.error('[parsePDF] 오류:', err);
    throw new Error(`PDF 파싱 실패: ${(err as Error).message}`);
  }
}

// ── 2. 청크 분할 ──────────────────────────────────────────────────────────
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

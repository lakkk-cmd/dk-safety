// Voyage AI 임베딩 — knowledge-store.ts가 이 함수를 재사용해 knowledge 테이블의
// embedding_voyage 컬럼을 채운다(청크 분할·저장은 knowledge-store.ts/knowledge-pdf-pipeline.ts로
// 이관됨 — brain/wiki/systems/RAG-파이프라인.md 참고).

// ── Voyage AI 임베딩 ───────────────────────────────────────────────────
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

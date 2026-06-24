/** OpenRouter를 통한 text-embedding-3-small 임베딩 (1536차원) */

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

/** 여러 텍스트를 한 번의 API 호출로 임베딩 — 청크가 많은 큰 PDF에서 청크당 네트워크 왕복을
 *  반복하지 않도록 한다(대형 PDF 처리 시간 초과의 가장 큰 원인이었다). 입력 순서대로 반환. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY가 필요합니다.");
  if (texts.length === 0) return [];

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: texts.map((t) => t.slice(0, 8000)), // 토큰 한도 안전 마진
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`임베딩 API 오류 ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
  const data = json.data ?? [];
  if (data.length !== texts.length) {
    throw new Error("임베딩 응답 개수가 입력과 일치하지 않습니다.");
  }
  return [...data]
    .sort((a, b) => a.index - b.index)
    .map((d) => {
      if (!d.embedding || d.embedding.length !== 1536) {
        throw new Error("임베딩 응답 형식이 올바르지 않습니다.");
      }
      return d.embedding;
    });
}

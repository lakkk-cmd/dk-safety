/** OpenRouter를 통한 text-embedding-3-small 임베딩 (1536차원) */

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY가 필요합니다.");

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: text.slice(0, 8000), // 토큰 한도 안전 마진
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`임베딩 API 오류 ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== 1536) {
    throw new Error("임베딩 응답 형식이 올바르지 않습니다.");
  }
  return embedding;
}

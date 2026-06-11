// Gemini API — 유튜브 영상 자막 분석 (마케팅/콘텐츠 인사이트)
// https://ai.google.dev/api/generate-content

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

export type VideoInsights = {
  key_points: string[];
  content_ideas: string[];
  relevance: "high" | "medium" | "low";
};

export type VideoAnalysis = {
  summary: string;
  insights: VideoInsights;
  model: string;
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    key_points: { type: "ARRAY", items: { type: "STRING" } },
    content_ideas: { type: "ARRAY", items: { type: "STRING" } },
    relevance: { type: "STRING", enum: ["high", "medium", "low"] },
  },
  required: ["summary", "key_points", "content_ideas", "relevance"],
};

const MAX_TRANSCRIPT_CHARS = 15_000;

export async function analyzeVideoTranscript(title: string, transcript: string): Promise<VideoAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  const prompt = `다음은 전기·주거 안전 관련 유튜브 영상의 자막입니다. "우리집 안심전기"(광주광역시 아파트 입주민 대상 전기 점검·수리 1인 사업자, dkansim.com)의 마케팅·콘텐츠 기획 관점에서 분석해 주세요.

영상 제목: ${title || "(제목 없음)"}

자막:
${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}

JSON으로 응답하세요:
- summary: 영상 핵심 내용 3~5문장 요약 (한국어)
- key_points: 핵심 포인트 (최대 5개, 한국어)
- content_ideas: 우리집 안심전기가 참고할 콘텐츠/마케팅 아이디어 (최대 3개, 한국어)
- relevance: 우리 사업(아파트 전기 점검·수리)과의 관련도 (high/medium/low)`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      const err = JSON.parse(raw) as { error?: { message?: string } };
      detail = err.error?.message ?? detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`Gemini API ${res.status} (${GEMINI_MODEL}): ${detail}`);
  }

  const data = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  const parsed = JSON.parse(text) as {
    summary?: string;
    key_points?: string[];
    content_ideas?: string[];
    relevance?: string;
  };

  const relevance: VideoInsights["relevance"] =
    parsed.relevance === "high" || parsed.relevance === "medium" || parsed.relevance === "low"
      ? parsed.relevance
      : "medium";

  return {
    summary: parsed.summary ?? "",
    insights: {
      key_points: parsed.key_points ?? [],
      content_ideas: parsed.content_ideas ?? [],
      relevance,
    },
    model: GEMINI_MODEL,
  };
}

/**
 * Claude 생성 결과물을 Gemini로 교차검증.
 * 결과는 agent_logs(source='cross_validator')에 자동 기록.
 */

import { logAgentEvent } from "@/lib/pipeline-logs";

// ── Gemini API 호출 ───────────────────────────────────────────────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY 없음");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 실패 (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ── 점수 파싱 ──────────────────────────────────────────────────────────────────

function parseScore(text: string): number {
  const m = text.match(/점수[:\s]*(\d+)/);
  if (m) return Math.min(100, Math.max(0, parseInt(m[1], 10)));
  if (/통과|정확|양호/.test(text)) return 90;
  if (/부정확|오류|위험|반려/.test(text)) return 30;
  return 50;
}

// ── 공통 로깅 ──────────────────────────────────────────────────────────────────

async function logResult(params: {
  type: string;
  target: string;
  original: string;
  verdict: string;
  score: number;
  passed: boolean;
}): Promise<void> {
  const label = params.passed ? "통과" : "검증실패";
  await logAgentEvent(
    params.passed ? "info" : "warn",
    "cross_validator",
    `[${params.type}] ${label} (점수:${params.score}) — ${params.target}`,
    {
      type: params.type,
      target: params.target,
      score: params.score,
      passed: params.passed,
      original: params.original.slice(0, 400),
      verdict: params.verdict.slice(0, 800),
    }
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. 콘텐츠 교차검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateContent(params: {
  title: string;
  content: string;
  contentType: "blog" | "kakao" | "youtube";
  keywords?: string[];
}): Promise<{ passed: boolean; score: number; reason: string; verdict: string }> {
  const typeLabel = { blog: "네이버 블로그 포스트", kakao: "카카오 채널 포스트", youtube: "유튜브 영상 스크립트" }[params.contentType];

  const prompt = `당신은 전기안전 콘텐츠 검증 전문가입니다.
아래 ${typeLabel}의 품질을 검증하고 점수를 매겨주세요.

검증 기준:
1. 사실 정확성 (전기안전 법령/기술 기준에 부합하는가)
2. 키워드 포함 여부: ${params.keywords?.join(", ") ?? "없음"}
3. 한국어 자연스러움
4. 광고성/과장 표현 없음
5. 안전 관련 오정보 없음

제목: ${params.title}

내용:
${params.content.slice(0, 2000)}

응답 형식:
점수: [0-100]
판정: [통과/반려]
이유: [구체적인 이유 2-3줄]`.trim();

  const verdict = await callGemini(prompt);
  const score = parseScore(verdict);
  const passed = score >= 90;

  await logResult({ type: "content", target: params.title, original: params.content, verdict, score, passed });
  return { passed, score, reason: verdict, verdict };
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. RAG 답변 교차검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateRAGAnswer(params: {
  question: string;
  answer: string;
  chunks: { content: string; source_file?: string }[];
}): Promise<{ passed: boolean; score: number; reason: string }> {
  const chunkText =
    params.chunks.length > 0
      ? params.chunks
          .slice(0, 5)
          .map((c, i) => `[출처${i + 1}${c.source_file ? ": " + c.source_file : ""}]\n${c.content.slice(0, 300)}`)
          .join("\n\n")
      : "(참고 자료 없음 — 일반 답변 품질 검증)";

  const prompt = `당신은 AI 답변 팩트체크 전문가입니다.
아래 질문에 대한 AI 답변의 품질을 검증해주세요.

질문: ${params.question}

AI 답변:
${params.answer.slice(0, 1000)}

참고 자료:
${chunkText}

검증 기준:
1. 답변이 사실에 근거하는가
2. 전기안전 관련 오정보가 있는가
3. 답변이 질문에 충실히 응답하는가

응답 형식:
점수: [0-100]
판정: [통과/반려]
이유: [구체적인 이유]`.trim();

  const verdict = await callGemini(prompt);
  const score = parseScore(verdict);
  const passed = score >= 80;

  await logResult({ type: "rag_answer", target: params.question, original: params.answer, verdict, score, passed });
  return { passed, score, reason: verdict };
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. 지식베이스 청크 교차검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateKnowledgeChunk(params: {
  sourceFile: string;
  content: string;
  category: string;
}): Promise<{ passed: boolean; score: number; reason: string }> {
  const prompt = `당신은 전기안전 지식베이스 품질 검증 전문가입니다.
아래 텍스트가 "${params.category}" 카테고리에 적합한 신뢰할 수 있는 내용인지 검증해주세요.

출처: ${params.sourceFile}
내용:
${params.content.slice(0, 1000)}

검증 기준:
1. 카테고리에 적합한 내용인가
2. 명백한 오정보가 있는가
3. 광고/스팸성 내용인가
4. 전기안전 관련 위험한 잘못된 정보가 있는가

응답 형식:
점수: [0-100]
판정: [통과/반려]
이유: [간단한 이유]`.trim();

  const verdict = await callGemini(prompt);
  const score = parseScore(verdict);
  const passed = score >= 70;

  await logResult({ type: "knowledge_chunk", target: params.sourceFile, original: params.content, verdict, score, passed });
  return { passed, score, reason: verdict };
}

// ── Gemini 사용 가능 여부 ──────────────────────────────────────────────────────

export const GEMINI_ENABLED = Boolean(process.env.GEMINI_API_KEY?.trim());

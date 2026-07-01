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

// ══════════════════════════════════════════════════════════════════════════════
// 4. 경비 데이터 검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateExpense(params: {
  category: string;
  amount: number;
  description?: string | null;
  paymentMethod: string;
  expenseDate: string;
}): Promise<{ passed: boolean; score: number; reason: string }> {
  const prompt = `당신은 소상공인 경비 데이터 검증 전문가입니다.
아래 경비 입력 데이터가 정상적인지 검증해주세요.

경비 데이터:
- 카테고리: ${params.category}
- 금액: ${params.amount.toLocaleString()}원
- 설명: ${params.description ?? "(없음)"}
- 결제수단: ${params.paymentMethod}
- 날짜: ${params.expenseDate}

검증 기준:
1. 금액이 비정상적으로 크지 않은가 (재료비 100만원 초과, 차량비 50만원 초과 등 이상값)
2. 카테고리와 설명이 일치하는가
3. 날짜가 미래 날짜가 아닌가
4. 금액이 0원 이하가 아닌가

응답 형식:
점수: [0-100]
판정: [통과/검토필요]
이유: [간단한 이유]`.trim();

  const verdict = await callGemini(prompt);
  const score = parseScore(verdict);
  const passed = score >= 70;

  await logResult({
    type: "expense",
    target: `${params.category} ${params.amount.toLocaleString()}원`,
    original: JSON.stringify(params),
    verdict,
    score,
    passed,
  });

  return { passed, score, reason: verdict };
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. 청구서/세금계산서 검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateInvoice(params: {
  type: string;
  customerName: string;
  items: { description: string; qty: number; unit_price: number; amount: number }[];
  subtotal: number;
  tax: number;
  total: number;
}): Promise<{ passed: boolean; score: number; reason: string; errors: string[] }> {
  const errors: string[] = [];

  // 금액 계산 자동 검증 (Gemini 없이, 빠르고 정확)
  const calculatedSubtotal = params.items.reduce((sum, item) => {
    const itemAmount = item.qty * item.unit_price;
    if (Math.abs(itemAmount - item.amount) > 1) {
      errors.push(`품목 "${item.description}" 금액 오류: ${item.qty}×${item.unit_price} = ${itemAmount}, 입력값: ${item.amount}`);
    }
    return sum + item.amount;
  }, 0);

  if (Math.abs(calculatedSubtotal - params.subtotal) > 1) {
    errors.push(`공급가액 오류: 계산값 ${calculatedSubtotal}, 입력값 ${params.subtotal}`);
  }

  if (params.type === "tax_invoice") {
    const calculatedTax = Math.round(params.subtotal * 0.1);
    if (Math.abs(calculatedTax - params.tax) > 1) {
      errors.push(`부가세 오류: 계산값 ${calculatedTax}(10%), 입력값 ${params.tax}`);
    }
  }

  const calculatedTotal = params.subtotal + params.tax;
  if (Math.abs(calculatedTotal - params.total) > 1) {
    errors.push(`합계 오류: 계산값 ${calculatedTotal}, 입력값 ${params.total}`);
  }

  // 수학 오류가 있으면 Gemini 호출 없이 즉시 반려
  if (errors.length > 0) {
    await logResult({
      type: "invoice",
      target: `${params.customerName} ${params.total.toLocaleString()}원`,
      original: JSON.stringify(params),
      verdict: `계산 오류: ${errors.join(", ")}`,
      score: 0,
      passed: false,
    });
    return { passed: false, score: 0, reason: errors.join("\n"), errors };
  }

  const prompt = `당신은 세금계산서/청구서 검증 전문가입니다.
아래 문서가 정상적인지 검증해주세요.

문서 유형: ${params.type === "tax_invoice" ? "세금계산서" : params.type === "quote" ? "견적서" : "영수증"}
고객명: ${params.customerName}
품목:
${params.items.map((i) => `- ${i.description}: ${i.qty}개 × ${i.unit_price.toLocaleString()}원 = ${i.amount.toLocaleString()}원`).join("\n")}
공급가액: ${params.subtotal.toLocaleString()}원
부가세: ${params.tax.toLocaleString()}원
합계: ${params.total.toLocaleString()}원

검증 기준:
1. 품목명이 전기안전 서비스에 적합한가
2. 금액이 합리적인 범위인가 (건당 1천만원 초과 등 이상값)
3. 고객명이 입력되어 있는가

응답 형식:
점수: [0-100]
판정: [통과/검토필요]
이유: [간단한 이유]`.trim();

  const verdict = await callGemini(prompt);
  const score = parseScore(verdict);
  const passed = score >= 80;

  await logResult({
    type: "invoice",
    target: `${params.customerName} ${params.total.toLocaleString()}원`,
    original: JSON.stringify(params).slice(0, 500),
    verdict,
    score,
    passed,
  });

  return { passed, score, reason: verdict, errors };
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. 상담 기록 검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateConsultation(params: {
  customerName: string;
  customerPhone: string;
  channel: string;
  content: string;
  nextContactAt?: string | null;
}): Promise<{ passed: boolean; score: number; reason: string }> {
  const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
  if (!phoneRegex.test(params.customerPhone.replace(/-/g, ""))) {
    return { passed: false, score: 0, reason: `연락처 형식 오류: ${params.customerPhone}` };
  }

  if (params.content.trim().length < 10) {
    return { passed: false, score: 0, reason: "상담 내용이 너무 짧습니다. 최소 10자 이상 입력해주세요." };
  }

  const prompt = `당신은 전기안전 서비스 상담 기록 검증 전문가입니다.
아래 상담 기록이 적절한지 검증해주세요.

고객명: ${params.customerName}
유입채널: ${params.channel}
상담내용: ${params.content}
다음연락일: ${params.nextContactAt ?? "미설정"}

검증 기준:
1. 상담 내용이 전기안전 서비스와 관련있는가
2. 내용이 충분히 구체적인가
3. 스팸/테스트 데이터가 아닌가

응답 형식:
점수: [0-100]
판정: [통과/검토필요]
이유: [간단한 이유]`.trim();

  const verdict = await callGemini(prompt);
  const score = parseScore(verdict);
  const passed = score >= 70;

  await logResult({
    type: "consultation",
    target: `${params.customerName} ${params.channel}`,
    original: params.content.slice(0, 200),
    verdict,
    score,
    passed,
  });

  return { passed, score, reason: verdict };
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. 작업자 배정 충돌 검증
// ══════════════════════════════════════════════════════════════════════════════

export async function validateWorkerAssignment(params: {
  workerId: string;
  workerName: string;
  reservationId: string;
  scheduledAt: string;
  existingAssignments: { scheduledAt: string; customerName: string }[];
}): Promise<{ passed: boolean; score: number; reason: string }> {
  const sameDay = params.existingAssignments.filter((a) => {
    const aDate = new Date(a.scheduledAt).toDateString();
    const newDate = new Date(params.scheduledAt).toDateString();
    return aDate === newDate;
  });

  if (sameDay.length >= 5) {
    return {
      passed: false,
      score: 0,
      reason: `${params.workerName} 작업자는 당일 이미 ${sameDay.length}건 배정됨. 과부하 위험.`,
    };
  }

  const newTime = new Date(params.scheduledAt).getTime();
  const conflict = params.existingAssignments.find((a) => {
    const existingTime = new Date(a.scheduledAt).getTime();
    return Math.abs(newTime - existingTime) < 2 * 60 * 60 * 1000; // 2시간
  });

  if (conflict) {
    return {
      passed: false,
      score: 0,
      reason: `일정 충돌: ${params.workerName} 작업자가 ${conflict.customerName} 고객 작업과 2시간 이내 중복됩니다.`,
    };
  }

  await logResult({
    type: "worker_assignment",
    target: `${params.workerName} → ${params.scheduledAt}`,
    original: JSON.stringify(params).slice(0, 300),
    verdict: "일정 충돌 없음",
    score: 95,
    passed: true,
  });

  return { passed: true, score: 95, reason: "배정 가능합니다." };
}

// ── Gemini 사용 가능 여부 ──────────────────────────────────────────────────────

export const GEMINI_ENABLED = Boolean(process.env.GEMINI_API_KEY?.trim());

import { getSupabaseAdmin } from "@/lib/supabase-pg";

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

async function callGeminiReview(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY 없음");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // gemini-2.5 계열은 기본적으로 내부 reasoning("thinking")에 maxOutputTokens를 먼저 소모해
        // 실제 리뷰 텍스트가 잘리는 문제가 있어 thinkingBudget:0으로 비활성화한다.
        // (cross-validate.ts의 callGemini()와 동일한 수정 — 이 파일은 별도 구현이라 누락돼 있었음)
        generationConfig: { temperature: 0.1, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 실패 (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("");
}

function parseScore(text: string): number {
  const m = text.match(/점수[:\s]*(\d+)/);
  if (m) return Math.min(100, Math.max(0, parseInt(m[1])));
  if (text.includes("통과") || text.includes("이상 없음")) return 90;
  if (text.includes("심각") || text.includes("보안")) return 20;
  return 50;
}

async function logReview(params: {
  files: string[];
  score: number;
  passed: boolean;
  issues: string[];
  verdict: string;
  commit: string;
}) {
  try {
    const client = getSupabaseAdmin();
    if (!client) return;
    await client.from("agent_logs").insert({
      level: params.passed ? "info" : "warn",
      source: "gemini_code_reviewer",
      message: `코드 리뷰 ${params.passed ? "통과" : "반려"} — 점수: ${params.score} / 파일: ${params.files.length}개`,
      meta: {
        files: params.files,
        commit: params.commit,
        score: params.score,
        passed: params.passed,
        issues: params.issues,
        verdict: params.verdict.slice(0, 2000),
        reviewed_at: new Date().toISOString(),
      },
    });
  } catch {
    // 로그 실패는 무시
  }
}

export type ReviewResult = {
  passed: boolean;
  score: number;
  issues: string[];
  verdict: string;
};

export async function reviewCode(params: {
  files: { path: string; content: string }[];
  context?: string;
  commit?: string;
}): Promise<ReviewResult> {
  const filesSummary = params.files
    .slice(0, 10)
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 1500)}\n\`\`\``)
    .join("\n\n");

  const prompt = `
당신은 Next.js 15 + TypeScript + Supabase 전문 코드 리뷰어입니다.
아래 변경된 코드를 검토하고 문제점을 찾아주세요.

작업 맥락: ${params.context ?? "일반 기능 구현"}

검토 기준:
1. 보안 취약점 (API 키 노출, 인증 누락, SQL 인젝션 등)
2. TypeScript 타입 오류 또는 any 남용
3. Supabase 쿼리 오류 가능성
4. 환경변수 미검증 사용
5. 에러 핸들링 누락
6. 성능 문제 (무한루프, N+1 쿼리 등)
7. Next.js App Router 패턴 위반

변경된 파일:
${filesSummary}

응답 형식 (반드시 이 형식으로):
점수: [0-100]
판정: [통과/반려]
심각도별 이슈:
🔴 심각: [보안/크래시 유발 문제, 없으면 없음]
🟡 경고: [성능/코드품질 문제, 없으면 없음]
🟢 제안: [개선 권장사항, 없으면 없음]
종합 의견: [2-3줄 요약]
`.trim();

  const verdict = await callGeminiReview(prompt);
  const score = parseScore(verdict);
  const passed = score >= 80;

  const issues: string[] = [];
  const red = verdict.match(/🔴 심각[:\s]*(.+)/g);
  const yellow = verdict.match(/🟡 경고[:\s]*(.+)/g);
  if (red) issues.push(...red);
  if (yellow) issues.push(...yellow);

  await logReview({
    files: params.files.map((f) => f.path),
    score,
    passed,
    issues,
    verdict,
    commit: params.commit ?? "unknown",
  });

  return { passed, score, issues, verdict };
}

export type CodeReviewLog = {
  id: string;
  level: string;
  source: string;
  message: string;
  meta: {
    files?: string[];
    commit?: string;
    score?: number;
    passed?: boolean;
    issues?: string[];
    verdict?: string;
    reviewed_at?: string;
  };
  created_at: string;
};

export async function listCodeReviewLogs(limit = 20): Promise<CodeReviewLog[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data } = await client
    .from("agent_logs")
    .select("*")
    .eq("source", "gemini_code_reviewer")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CodeReviewLog[];
}

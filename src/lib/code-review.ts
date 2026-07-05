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

// Gemini에게 "판정: 통과/반려"를 직접 답하도록 프롬프트에서 요청해놓고, 정작 이 답을
// 무시한 채 임의의 점수 컷오프(예: 80점)로 재판정하면 Gemini 스스로도 "통과"라고 적어놓은
// 코드가 CI에서는 반려되는 모순이 발생한다. 점수 컷오프는 판정 줄이 없을 때의 폴백으로만 쓴다.
function parseVerdictPass(text: string): boolean | null {
  const m = text.match(/판정[:\s]*(통과|반려)/);
  if (!m) return null;
  return m[1] === "통과";
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
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 30000)}\n\`\`\``)
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

🔴 심각은 실제로 크래시, 보안 침해(키/토큰 유출), 데이터 손상/불일치를 일으킬 수 있는
문제에만 사용하세요. 합리적인 기본값이 있는 환경변수 폴백(예: \`?? "default"\`), 일반적인
에러 메시지 처리, \`throwOnError()\`처럼 의도적인 방어 패턴은 스타일 개선 여지가 있어도
크래시/보안/데이터손상으로 직결되지 않는 한 🟡 경고나 🟢 제안으로 분류하세요.

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
  const verdictPass = parseVerdictPass(verdict);
  const passed = verdictPass !== null ? verdictPass : score >= 80;

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

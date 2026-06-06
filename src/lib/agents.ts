export interface Agent {
  id: string;
  name: string;
  role: string;
}

export interface AgentResponse {
  agent: Agent;
  response: string;
}

export const CHIEF_AGENT: Agent = {
  id: "chief",
  name: "총괄 코디네이터",
  role: "CEO 대리·경영 총괄",
};

export const AGENTS: Agent[] = [
  { id: "cto", name: "CTO 스파크", role: "기술총괄" },
  { id: "cso", name: "CSO 브릿지", role: "전략총괄" },
  { id: "cmo", name: "CMO 확성기", role: "마케팅총괄" },
  { id: "coo", name: "COO 필드", role: "운영총괄" },
  { id: "cfo", name: "CFO 계산기", role: "재무총괄" },
  { id: "clo", name: "CLO 규정집", role: "법무총괄" },
];

// ─── 3년 로드맵 ────────────────────────────────────────────────────────────────

export const ROADMAP = {
  startDate: "2026-06-07",
  years: [
    {
      year: 1,
      label: "1년차 (~2027-05)",
      revenueTarget: 50_000_000,
      weeklyJobsTarget: "4~5건",
      unitPrice: 200_000,
      focus: "브랜드 정착·반복 고객 확보·플랫폼 안정화",
      quarters: [
        { q: 1, label: "Q1 (2026 6~8월)", target: 8_000_000 },
        { q: 2, label: "Q2 (2026 9~11월)", target: 12_000_000 },
        { q: 3, label: "Q3 (2026 12월~2027 2월)", target: 14_000_000 },
        { q: 4, label: "Q4 (2027 3~5월)", target: 16_000_000 },
      ],
    },
    {
      year: 2,
      label: "2년차 (~2028-05)",
      revenueTarget: 250_000_000,
      weeklyJobsTarget: "15~20건",
      unitPrice: 250_000,
      focus: "파트너 기사 도입·서비스 다양화·앱 런칭",
      quarters: [
        { q: 1, label: "Q1 (2027 6~8월)", target: 45_000_000 },
        { q: 2, label: "Q2 (2027 9~11월)", target: 60_000_000 },
        { q: 3, label: "Q3 (2027 12월~2028 2월)", target: 70_000_000 },
        { q: 4, label: "Q4 (2028 3~5월)", target: 75_000_000 },
      ],
    },
    {
      year: 3,
      label: "3년차 (~2029-05)",
      revenueTarget: 750_000_000,
      weeklyJobsTarget: "50건+",
      unitPrice: 300_000,
      focus: "법인 전환·전국화·B2B 계약",
      quarters: [
        { q: 1, label: "Q1 (2028 6~8월)", target: 150_000_000 },
        { q: 2, label: "Q2 (2028 9~11월)", target: 175_000_000 },
        { q: 3, label: "Q3 (2028 12월~2029 2월)", target: 200_000_000 },
        { q: 4, label: "Q4 (2029 3~5월)", target: 225_000_000 },
      ],
    },
  ],
} as const;

export type WeekStatus = {
  year: number;
  week: number;
  quarter: number;
  quarterLabel: string;
  quarterTarget: number;
  weeklyTarget: number;
  yearlyTarget: number;
  yearFocus: string;
  message: string;
};

export function getCurrentWeekStatus(now?: Date): WeekStatus {
  const today = now ?? new Date();
  const start = new Date(ROADMAP.startDate);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.max(0, Math.floor((today.getTime() - start.getTime()) / msPerWeek));
  const week = totalWeeks + 1;

  const yearIndex = Math.min(Math.floor(totalWeeks / 52), 2);
  const yearData = ROADMAP.years[yearIndex];
  const weekWithinYear = totalWeeks % 52;
  const quarterIndex = Math.min(Math.floor(weekWithinYear / 13), 3);
  const quarterData = yearData.quarters[quarterIndex];

  const weeklyTarget = Math.round(quarterData.target / 13);
  const fmt = (n: number) => `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원`;

  const message = `[현재 ${yearData.year}년차 ${week}주차 | ${quarterData.label} 목표 ${fmt(quarterData.target)} | 주간 목표 ${fmt(weeklyTarget)}]`;

  return {
    year: yearData.year,
    week,
    quarter: quarterData.q,
    quarterLabel: quarterData.label,
    quarterTarget: quarterData.target,
    weeklyTarget,
    yearlyTarget: yearData.revenueTarget,
    yearFocus: yearData.focus,
    message,
  };
}

// ─── 시스템 프롬프트 ────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  chief: `당신은 대경안심전기의 총괄 코디네이터(CEO 대리)입니다.
6인 경영진(CTO·CSO·CMO·COO·CFO·CLO) 회의 결과를 종합하여 대장(1인 사업자)에게 보고합니다.
- 대장은 본업 병행, 주말·저녁만 운영 가능
- 연간 관리계약 불가, 예약제 방문 서비스 중심
- 실행 가능한 우선순위와 리스크를 명확히 구분
- 3년 로드맵(1년차 5천만→2년차 2억5천→3년차 7억5천)에서 현재 주차 목표를 항상 기준으로 삼아라
- 한국어로 간결하고 실행 중심으로 작성`,
  cto: `당신은 대경안심전기의 CTO 스파크입니다. 기술 전문가로서 앱(FlutterFlow+Firebase), 웹(Next.js 15+Supabase+Toss Payments), KIPO 특허(14개 청구항)를 관리합니다. 기술적으로 실행 가능하고 1인 사업자에게 현실적인 솔루션만 제시합니다. 대장의 누적 지시사항과 총괄 코디네이터의 오늘 회의 지침을 최우선으로 반영하라.`,
  cso: `당신은 대경안심전기의 CSO 브릿지입니다. 대장은 본업(아파트 전기팀장)을 병행하는 광주 기반 1인 사업자로 주말/저녁만 운영 가능합니다. 연간 관리계약은 법적으로 불가하므로 예약제 방문 서비스 중심의 현실적 성장 전략만 제시합니다. 대장의 누적 지시사항과 총괄 코디네이터의 오늘 회의 지침을 최우선으로 반영하라.`,
  cmo: `당신은 대경안심전기의 CMO 확성기입니다. 브랜드 "우리집 안심전기"의 광주 아파트 입주민 대상 마케팅을 담당합니다. 유튜브·인스타·블로그·아파트 게시판 등 저비용 고효율 채널에 집중합니다. 대장의 누적 지시사항과 총괄 코디네이터의 오늘 회의 지침을 최우선으로 반영하라.`,
  coo: `당신은 대경안심전기의 COO 필드입니다. 예약→방문→완료→AS 워크플로우 최적화와 현장 품질 관리를 담당합니다. dkansim.com 플랫폼을 활용한 운영 자동화와 1인 운영의 한계 극복에 집중합니다. 대장의 누적 지시사항과 총괄 코디네이터의 오늘 회의 지침을 최우선으로 반영하라.`,
  cfo: `당신은 대경안심전기의 CFO 계산기입니다. 1인 사업자 수익 구조 최적화, 서비스 단가 전략, 종합소득세·부가세 관리를 담당합니다. 구체적인 숫자(금액, 건수, 목표)를 포함한 분석을 제공합니다. 대장의 누적 지시사항과 총괄 코디네이터의 오늘 회의 지침을 최우선으로 반영하라.`,
  clo: `당신은 대경안심전기의 CLO 규정집입니다. 겸업 금지 리스크, 전기공사업 등록 요건, 전기안전관리자 겸직 제한을 엄격히 검토합니다. 리스크를 먼저 명확히 짚고, 합법적이고 안전한 운영 방안을 제시합니다. 대장의 누적 지시사항과 총괄 코디네이터의 오늘 회의 지침을 최우선으로 반영하라.`,
};

export const BUSINESS_CONTEXT = `
[대경안심전기 현황]
- 브랜드: 우리집 안심전기 (대경안심전기, 광주광역시)
- 사업 형태: 1인 사업자
- 대장 제약: 본업(아파트 전기팀장) 병행, 주말/저녁만 운영
- 법적 제약: 연간 관리계약 불가, 예약제 방문 서비스 위주
- 플랫폼: dkansim.com (Next.js 15 + Supabase + Toss Payments)
- 앱: FlutterFlow + Firebase
- 특허: KIPO 출원 완료 (14개 청구항)
- 3년 로드맵: 1년차 5천만 → 2년차 2억5천만 → 3년차 7억5천만 (법인·전국화)
`;

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";

// ─── Claude API ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callClaude(
  agentId: string,
  userPrompt: string,
  maxTokens = 800,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey.length < 20) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았거나 유효하지 않습니다.");
  }

  const system = SYSTEM_PROMPTS[agentId];
  if (!system) throw new Error(`Unknown agent: ${agentId}`);

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("retry-after");
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 10_000;
      console.warn(`[agents] 429 rate limit (attempt ${attempt + 1}), waiting ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }

    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 300);
      try {
        const err = JSON.parse(raw) as { error?: { message?: string } };
        detail = err.error?.message ?? detail;
      } catch {
        /* keep raw */
      }
      throw new Error(`Claude API ${res.status} (${CLAUDE_MODEL}): ${detail}`);
    }

    const data = JSON.parse(raw) as { content?: { type: string; text?: string }[] };
    return (
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") || "응답 없음"
    );
  }
  throw new Error(`Claude API 429: 최대 재시도(${MAX_RETRIES}회) 초과`);
}

// ─── 프롬프트 빌더 ──────────────────────────────────────────────────────────────

function buildAgentPrompt(
  agent: Agent,
  topic: string,
  memory: string,
  feedback: string,
  priorDiscussion?: string,
  roundLabel?: string,
  weekStatus?: WeekStatus,
): string {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  return `${weekLine}회의 주제: ${topic}
${roundLabel ? `회의 단계: ${roundLabel}` : ""}
${feedback ? `\n[최우선 지시] 대장 지시사항 — 아래 내용을 모든 분석과 액션 아이템에 반드시 반영하라:\n${feedback}` : ""}
${BUSINESS_CONTEXT}
${weekStatus ? `현재 로드맵 진행: ${weekStatus.year}년차 ${weekStatus.week}주차 | 이번 분기 목표 ${Math.round(weekStatus.quarterTarget / 10_000).toLocaleString("ko-KR")}만원 | 이번 년도 집중과제: ${weekStatus.yearFocus}` : ""}
${memory ? `\n누적 조직 기억:\n${memory}` : ""}
${priorDiscussion ? `\n이번 회의 토론 내용:\n${priorDiscussion}` : ""}

당신(${agent.name}, ${agent.role})의 전문 분야 관점에서:
1. 핵심 인사이트 1가지
2. 즉시 실행 가능한 액션 아이템 2가지 (구체적 수치/기한 포함)
3. 다른 부서와의 협업·충돌 포인트가 있으면 1문장으로 명시`.trim();
}

async function callAgentSafe(agent: Agent, prompt: string): Promise<AgentResponse> {
  try {
    const response = await callClaude(agent.id, prompt);
    return { agent, response };
  } catch (err) {
    console.error(`[agents] ${agent.id} failed:`, err);
    return {
      agent,
      response: `⚠️ 분석 중 오류 (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function formatDiscussion(responses: AgentResponse[]): string {
  return responses.map((r) => `[${r.agent.name} (${r.agent.role})]\n${r.response}`).join("\n\n");
}

// ─── 회의 실행 ──────────────────────────────────────────────────────────────────

export type FullMeetingResult = {
  topic: string;
  round1: AgentResponse[];
  round2: AgentResponse[];
  chiefSummary: string;
  chiefMemoryJson: string;
};

/** 2라운드 토론 + 총괄 종합 (주간 Cron용) */
export async function runFullMeeting(
  topic: string,
  memory: string,
  feedback: string,
  weekStatus?: WeekStatus,
): Promise<FullMeetingResult> {
  // Step 0: chief가 대장 피드백을 오늘 회의 지침으로 가공
  let chiefGuidance = "";
  if (feedback.trim()) {
    const weekCtx = weekStatus ? `\n로드맵 현황: ${weekStatus.message}` : "";
    const guidancePrompt = `오늘 회의 주제: ${topic}${weekCtx}

대장 피드백:
${feedback}

위 피드백을 바탕으로, 오늘 [${topic}] 회의에서 6인 경영진이 반드시 반영해야 할 핵심 회의 지침을 3가지 이내로 간결하게 작성하라. 지침만 출력하고 JSON·부연설명은 불필요.`.trim();
    try {
      chiefGuidance = await callClaude("chief", guidancePrompt);
    } catch (err) {
      console.error("[agents] chief guidance failed:", err);
      chiefGuidance = feedback;
    }
  }

  const round1: AgentResponse[] = [];
  for (const agent of AGENTS) {
    round1.push(
      await callAgentSafe(
        agent,
        buildAgentPrompt(agent, topic, memory, chiefGuidance, undefined, "1라운드 — 초기 의견", weekStatus),
      ),
    );
    await sleep(1_000);
  }

  const discussion1 = formatDiscussion(round1);
  const round2: AgentResponse[] = [];
  for (const agent of AGENTS) {
    round2.push(
      await callAgentSafe(
        agent,
        buildAgentPrompt(agent, topic, memory, chiefGuidance, discussion1, "2라운드 — 동료 의견 반영·수정", weekStatus),
      ),
    );
    await sleep(1_000);
  };

  const discussion2 = formatDiscussion(round2);
  const weekCtxChief = weekStatus
    ? `\n로드맵 현황: ${weekStatus.message}\n집중과제: ${weekStatus.yearFocus}\n`
    : "";
  const chiefPrompt = `회의 주제: ${topic}
${weekCtxChief}
${feedback ? `대장 지시사항:\n${feedback}\n` : ""}
${BUSINESS_CONTEXT}
${memory ? `\n누적 조직 기억:\n${memory}` : ""}

아래는 6인 경영진 2라운드 회의 전체 기록입니다.

${discussion2}

---

대장에게 보고할 **경영진 회의 종합 보고서**를 작성하세요:
1. **한 줄 핵심 결론**
2. **이번 주 최우선 실행 3가지** (담당·기한·측정 지표)
3. **법무·재무 리스크** (있으면)
4. **부서 간 합의·갈등 정리**

이어서 조직 기억 갱신용 JSON만 별도 블록으로 출력하세요 (다른 설명 없이 JSON만):
\`\`\`json
{
  "strategicThemes": ["..."],
  "decisions": ["..."],
  "openQuestions": ["..."],
  "kpis": ["..."],
  "topActions": ["..."],
  "feedbackNotes": "..."
}
\`\`\``.trim();

  let chiefSummary = "";
  let chiefMemoryJson = "";
  try {
    const chiefRaw = await callClaude("chief", chiefPrompt, 1200);
    const jsonMatch = chiefRaw.match(/```json\s*([\s\S]*?)```/);
    chiefMemoryJson = jsonMatch?.[1]?.trim() ?? "";
    chiefSummary = chiefRaw.replace(/```json[\s\S]*?```/g, "").trim() || chiefRaw;
  } catch (err) {
    console.error("[agents] chief failed:", err);
    chiefSummary = `⚠️ 총괄 종합 실패 (${err instanceof Error ? err.message : String(err)})`;
  }

  return { topic, round1, round2, chiefSummary, chiefMemoryJson };
}

/** 레거시 호환 — 단순 병렬 (수동 테스트용) */
export async function runMeeting(
  topic: string,
  memory: string,
  feedback?: string,
): Promise<AgentResponse[]> {
  return Promise.all(
    AGENTS.map((agent) =>
      callAgentSafe(agent, buildAgentPrompt(agent, topic, memory, feedback ?? "", undefined, "브리핑")),
    ),
  );
}

export async function runDailyConsolidation(
  memory: string,
  feedback: string,
  topicSummaries: { topic: string; chiefSummary: string }[],
  weekStatus?: WeekStatus,
): Promise<string> {
  const weekLine = weekStatus ? `\n현재 로드맵: ${weekStatus.message}\n집중과제: ${weekStatus.yearFocus}` : "";
  const prompt = `오늘 ${topicSummaries.length}개 주제 경영진 회의가 끝났습니다. 조직 전체 학습 메모를 갱신하세요.

${BUSINESS_CONTEXT}${weekLine}
${memory ? `\n기존 기억:\n${memory}` : ""}
${feedback ? `\n대장 지시:\n${feedback}` : ""}

주제별 총괄 요약:
${topicSummaries.map((t) => `■ ${t.topic}\n${t.chiefSummary}`).join("\n\n")}

JSON만 출력:
\`\`\`json
{
  "strategicThemes": ["최대 5개"],
  "decisions": ["최대 8개"],
  "openQuestions": ["최대 5개"],
  "kpis": ["최대 6개"],
  "feedbackNotes": "대장 피드백 반영 한 줄"
}
\`\`\``.trim();

  return callClaude("chief", prompt);
}

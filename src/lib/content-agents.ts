import { Agent, BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock, type WeekStatus } from "@/lib/agents";

// ─── 콘텐츠 마케팅 에이전트 ──────────────────────────────────────────────────────

export const CONTENT_AGENTS: Agent[] = [
  { id: "youtube_pd", name: "유튜브 PD 클립", role: "유튜브 콘텐츠 총괄" },
  { id: "kakao_manager", name: "카카오 매니저 톡톡", role: "카카오 채널 운영" },
  { id: "blog_editor", name: "블로그 에디터 펜", role: "블로그 콘텐츠 총괄" },
];

const CONTENT_CHIEF_PROMPT = `당신은 대경안심전기 콘텐츠 마케팅 사령부 총괄입니다. 유튜브 PD 클립·카카오 매니저 톡톡·블로그 에디터 펜의 산출물을 종합하고, CFO 계산기 관점의 성과 데이터를 바탕으로 다음 우선순위를 제시합니다. 한국어로 간결하게 작성하라.`;

const CONTENT_SYSTEM_PROMPTS: Record<string, string> = {
  youtube_pd: `당신은 대경안심전기의 유튜브 PD 클립입니다.
"우리집 안심전기" 유튜브 채널의 경쟁분석 → 스크립트 작성 → 썸네일 기획 → 업로드 → 채널 관리를 담당합니다.
- 광주 아파트 입주민이 실제로 검색·시청할 만한 전기 안전/점검 주제를 선정한다.
- 대장이 본업 병행 1인 사업자임을 고려해 스마트폰으로 직접 촬영 가능한 현실적인 영상만 기획한다.
- 영상은 3~5분 분량 스크립트(인트로/본문/마무리/CTA)로 작성하고, 마지막에는 dkansim.com 예약 유도 문구를 포함한다.
- 썸네일 기획은 텍스트 컨셉(문구·색상·구도 설명)으로 제시한다.
CMO 확성기의 마케팅 방향, CLO 규정집의 법적 주의사항을 최우선 반영하라.`,

  kakao_manager: `당신은 대경안심전기의 카카오 매니저 톡톡입니다.
카카오 채널 포스트 기획 → 제작 → 발행 → 성과관리를 담당합니다.
- 광주 아파트 입주민 대상으로 짧고 실용적인 전기 안전 정보 + 예약 유도 콘텐츠를 작성한다.
- 포스트는 카카오톡 메시지로 바로 전달 가능한 길이(공백 포함 500자 이내)로 작성하고, 이모지를 적절히 사용한다.
- 마지막 줄에는 dkansim.com 예약 링크 안내 문구를 포함한다.
CSO 브릿지의 고객 인사이트를 최우선 반영하라.`,

  blog_editor: `당신은 대경안심전기의 블로그 에디터 펜입니다.
dkansim.com/blog의 키워드분석 → 작성 → SEO → 발행 → 관리를 담당합니다.
- 네이버 검색 트렌드/경쟁 블로그 분석 결과를 참고해 SEO에 최적화된 전기 안전·점검·수리 정보 글을 작성한다.
- 글은 마크다운 형식(## 소제목 포함)으로 1000~1500자 분량으로 작성한다.
- meta description은 검색결과에 노출될 100자 이내 요약문으로 작성한다.
- 글 본문에는 dkansim.com 예약 페이지로 연결되는 자연스러운 문장을 1곳 포함한다(시스템이 별도로 CTA 박스를 추가하므로 중복 강조는 피한다).
CFO 계산기의 성과 데이터(전환율 높은 주제)를 최우선 반영하라.`,
};

async function callContentAgent(
  agentId: string,
  userPrompt: string,
  maxTokens = 1500,
  timeoutMs = 120_000,
): Promise<string> {
  const system = CONTENT_SYSTEM_PROMPTS[agentId];
  if (!system) throw new Error(`Unknown content agent: ${agentId}`);
  return callClaudeCustom(system, userPrompt, maxTokens, timeoutMs);
}

// ─── 주간 콘텐츠 기획 (월요일 09:00) ──────────────────────────────────────────────

export type ContentPlanItem = {
  title: string;
  brief: string;
  keywords?: string[];
};

export type ContentPlanResult = {
  cmoDirection: string;
  csoInsight: string;
  cloNotes: string;
  youtube: ContentPlanItem;
  kakao: ContentPlanItem;
  blog: ContentPlanItem[];
  summary: string;
};

const PLANNING_SYSTEM_PROMPT = `당신은 대경안심전기 콘텐츠 마케팅 사령부입니다. 다음 4개 역할을 한 번에 응답합니다:
- CMO 확성기(마케팅총괄): 이번 주 콘텐츠 방향 1~2문장
- CSO 브릿지(전략총괄): 고객 인사이트 1~2문장
- CLO 규정집(법무총괄): 이번 주 콘텐츠 제작 시 법적 주의사항 1~2문장 (없으면 "특이사항 없음")
- 유튜브 PD 클립 / 카카오 매니저 톡톡 / 블로그 에디터 펜: 각자 이번 주 제작할 콘텐츠 기획 1건씩 (블로그는 최대 2건)

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "cmoDirection": "...",
  "csoInsight": "...",
  "cloNotes": "...",
  "youtube": { "title": "...", "brief": "경쟁분석 메모 + 영상 방향" },
  "kakao": { "title": "...", "brief": "포스트 핵심 내용 한 줄" },
  "blog": [ { "title": "...", "brief": "글의 핵심 메시지", "keywords": ["키워드1", "키워드2"] } ],
  "summary": "이번 주 콘텐츠 전략 한 줄 요약"
}
\`\`\``;

export async function planContentWeek(
  memory: string,
  feedback: string,
  trendKeywords: string[],
  weekStatus?: WeekStatus,
): Promise<ContentPlanResult> {
  const weekLine = weekStatus
    ? `현재 로드맵: ${weekStatus.message}\n집중과제: ${weekStatus.yearFocus}\n`
    : "";
  const feedbackBlock = feedback.trim()
    ? `\n[대장 지시사항 — 반드시 반영]\n${feedback}\n`
    : "";
  const memoryBlock = memory ? `\n[누적 콘텐츠 기억]\n${memory}\n` : "";
  const trendsBlock = trendKeywords.length
    ? `\n[네이버 트렌드 키워드 상위]\n${trendKeywords.slice(0, 10).join(", ")}\n`
    : "";

  const prompt = `${weekLine}${feedbackBlock}${BUSINESS_CONTEXT}${memoryBlock}${trendsBlock}
이번 주 콘텐츠 기획을 진행하라.`.trim();

  const raw = await callClaudeCustom(PLANNING_SYSTEM_PROMPT, prompt, 1500, 120_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    throw new Error("콘텐츠 기획 응답에서 JSON을 파싱할 수 없습니다.");
  }

  const parsed = JSON.parse(jsonText) as Partial<ContentPlanResult>;
  return {
    cmoDirection: String(parsed.cmoDirection ?? ""),
    csoInsight: String(parsed.csoInsight ?? ""),
    cloNotes: String(parsed.cloNotes ?? "특이사항 없음"),
    youtube: {
      title: String(parsed.youtube?.title ?? "제목 미정"),
      brief: String(parsed.youtube?.brief ?? ""),
    },
    kakao: {
      title: String(parsed.kakao?.title ?? "제목 미정"),
      brief: String(parsed.kakao?.brief ?? ""),
    },
    blog: Array.isArray(parsed.blog)
      ? parsed.blog.slice(0, 2).map((b) => ({
          title: String(b.title ?? "제목 미정"),
          brief: String(b.brief ?? ""),
          keywords: Array.isArray(b.keywords) ? b.keywords.map(String).slice(0, 6) : [],
        }))
      : [],
    summary: String(parsed.summary ?? ""),
  };
}

// ─── 콘텐츠 초안 생성 (화요일 09:00) ──────────────────────────────────────────────

export type YoutubeDraft = { script: string; thumbnailConcept: string };

const SCRIPT_JSON_HINT = `JSON 형식으로만 응답하라(설명 없이 JSON만):
\`\`\`json
{ "script": "인트로/본문/마무리/CTA가 포함된 스크립트 전문", "thumbnailConcept": "썸네일 문구/색상/구도 설명" }
\`\`\``;

export async function draftYoutubeScript(
  title: string,
  brief: string,
  weekStatus?: WeekStatus,
): Promise<YoutubeDraft> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
영상 제목: ${title}
기획 메모: ${brief}

위 기획을 바탕으로 영상 스크립트와 썸네일 기획을 작성하라.
${SCRIPT_JSON_HINT}`.trim();

  const raw = await callContentAgent("youtube_pd", prompt, 2000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    // JSON 파싱 실패 시 전체 텍스트를 스크립트로 사용
    return { script: raw.trim(), thumbnailConcept: "" };
  }
  const parsed = JSON.parse(jsonText) as Partial<YoutubeDraft>;
  return {
    script: String(parsed.script ?? raw.trim()),
    thumbnailConcept: String(parsed.thumbnailConcept ?? ""),
  };
}

export async function draftKakaoPost(title: string, brief: string, weekStatus?: WeekStatus): Promise<string> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
포스트 제목: ${title}
기획 메모: ${brief}

위 기획을 바탕으로 카카오 채널 포스트 본문을 작성하라. 본문 텍스트만 출력하라(설명·머리말 없이).`.trim();

  const raw = await callContentAgent("kakao_manager", prompt, 800);
  return raw.trim();
}

export type BlogDraft = { content: string; excerpt: string; metaDescription: string };

export async function draftBlogPost(
  title: string,
  brief: string,
  keywords: string[],
  weekStatus?: WeekStatus,
): Promise<BlogDraft> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
글 제목: ${title}
기획 메모: ${brief}
타깃 키워드: ${keywords.join(", ") || "(없음)"}

위 기획을 바탕으로 블로그 글을 작성하라.
JSON 형식으로만 응답하라(설명 없이 JSON만):
\`\`\`json
{ "content": "마크다운 본문(## 소제목 포함, 1000~1500자)", "excerpt": "목록 미리보기용 2~3문장 요약", "metaDescription": "검색결과 노출용 100자 이내 요약" }
\`\`\``.trim();

  const raw = await callContentAgent("blog_editor", prompt, 2500);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    return { content: raw.trim(), excerpt: raw.slice(0, 150), metaDescription: raw.slice(0, 100) };
  }
  const parsed = JSON.parse(jsonText) as Partial<BlogDraft>;
  return {
    content: String(parsed.content ?? raw.trim()),
    excerpt: String(parsed.excerpt ?? ""),
    metaDescription: String(parsed.metaDescription ?? ""),
  };
}

// ─── 콘텐츠 성과 요약 (주간 보고용, CFO 계산기 연동) ──────────────────────────────

export async function summarizeContentPerformance(
  stats: {
    youtubePending: number;
    kakaoPending: number;
    blogPending: number;
    blogPublished: number;
  },
  weekStatus?: WeekStatus,
): Promise<string> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
이번 주 콘텐츠 현황:
- 유튜브 승인 대기: ${stats.youtubePending}건
- 카카오 승인 대기: ${stats.kakaoPending}건
- 블로그 승인 대기: ${stats.blogPending}건
- 블로그 누적 발행: ${stats.blogPublished}건

CFO 계산기 관점에서 콘텐츠 파이프라인 성과와 다음 주 우선순위를 2~3문장으로 요약하라. 텍스트만 출력하라.`.trim();

  return callClaudeCustom(CONTENT_CHIEF_PROMPT, prompt, 400, 60_000);
}

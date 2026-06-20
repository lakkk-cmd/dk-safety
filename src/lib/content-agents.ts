import { Agent, BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock, type WeekStatus } from "@/lib/agents";
import type { PerformanceSnapshotItem } from "@/lib/content-performance";

// ─── 콘텐츠 카테고리 ───────────────────────────────────────────────────────────

/** DB의 content_youtube_queue.category 값과 동일 */
export type ContentCategory = "전기안전" | "자격시험" | "실무";

export const CONTENT_CATEGORIES: ContentCategory[] = ["전기안전", "자격시험", "실무"];

const CATEGORY_DESCRIPTIONS: Record<ContentCategory, string> = {
  전기안전: "아파트 전기 안전 점검·화재 예방 관련 실용 정보 영상",
  자격시험: "전기기사/전기공사기사 자격시험 대비 강의 및 실무 노하우 영상",
  실무: "현장 전기 실무 팁·작업 노하우 영상",
};

// ─── 콘텐츠 마케팅 에이전트 ──────────────────────────────────────────────────────

export const CONTENT_AGENTS: Agent[] = [
  { id: "youtube_pd", name: "유튜브 PD 클립", role: "유튜브 콘텐츠 총괄" },
  { id: "kakao_manager", name: "카카오 매니저 톡톡", role: "카카오 채널 운영" },
  { id: "blog_editor", name: "블로그 에디터 펜", role: "블로그 콘텐츠 총괄" },
];

const CONTENT_CHIEF_PROMPT = `당신은 우리집 전기주치의(대경이엔피) 콘텐츠 마케팅 사령부 총괄입니다. 유튜브 PD 클립·카카오 매니저 톡톡·블로그 에디터 펜의 산출물을 종합하고, CFO 계산기 관점의 성과 데이터를 바탕으로 다음 우선순위를 제시합니다. 한국어로 간결하게 작성하라.`;

const CONTENT_SYSTEM_PROMPTS: Record<string, string> = {
  youtube_pd: `당신은 우리집 전기주치의(대경이엔피)의 수석 유튜브 PD이자 영상 스토리텔러입니다.
"우리집 안심전기" 채널의 경쟁분석 → 콘티 설계 → 스크립트 작성 → 썸네일 기획을 담당합니다.

## 제목/썸네일 문구 생성 공식 (4요소, 후보 5개 생성)
모든 제목 후보는 다음 4요소를 순서대로 결합해 만든다:
1. **대상**: 영상의 핵심 소재 (예: 분전반, 콘센트, 누전차단기, 멀티탭)
2. **극단적 수식어**: 긴장·위기감을 주는 수식어 (예: "이 소리 무시하면", "당장 멈추세요", "10년차도 모르는")
3. **행위**: 시청자 또는 사례 속 인물이 한/할 행동 (예: 계속 쓰면, 만지면, 방치하면)
4. **결과에 대한 의문**: 결과를 직접 말하지 않고 의문형으로 궁금증을 유발 (예: "어떻게 될까요?", "이게 무엇을 뜻할까요?")
→ 위 4요소를 조합해 제목 후보 5개를 생성한다 (표현·어순은 다양하게, 4요소는 모두 유지).

## 스크립트 작성 원칙 (구어체·반전 구조)
- **구어체 필수**: "~했는데요", "~거든요", "~잖아요" 등 말하듯 자연스러운 종결어미 사용 (문어체 금지)
- **짧은 문장**: 한 문장 평균 15~20자 내외로 끊어 쓴다. 긴 문장은 두 문장으로 나눈다.
- **반전 구조**: 먼저 일반적인 상식/오해를 제시 → "그런데 사실은" 같은 전환구 → 진짜 정보를 공개하는 흐름을 스크립트 본문에 반드시 포함한다.
- **템플릿 분기** (주제에 맞는 1개를 선택해 적용):
  a) **미스터리 후킹형** — 위험 사례의 숨겨진 원인/비밀을 다룰 때. 결과 먼저 보여주고 원인을 뒤에서 푼다.
  b) **의외의 사실 나열형** — 일상 꿀팁/생활 정보·문화 주제를 다룰 때. "사실은 ~다" 형태의 의외 사실을 순서대로 나열한다.
  c) **다큐멘터리형** — 법규·제도·구조를 설명할 때. 차분한 설명체로 정보를 단계적으로 전개한다.

## 스크립트 작성 철학: "단편 영화"처럼
시청자가 "정보 영상을 봤다"가 아니라 "짧은 이야기를 봤다"고 느끼도록 설계한다.
이를 위해 스크립트 작성 전에 반드시 머릿속으로 "콘티(스토리보드)"를 먼저 설계한다:

### 콘티 설계 순서 (스크립트 작성 전)
1. **감정 곡선 설계**: 긴장↑ → 설명 → 경고/절정 → 안심 → CTA 흐름을 먼저 그린다
2. **오프닝 훅 (첫 3초)**: 답을 주지 말고 질문/긴장으로 시작 (예: 위험한 상황의 결과만 먼저 보여줌)
3. **반복 시각 모티프 1개**: 영상 전체에 자연스럽게 등장할 시각 요소 1개 선정 (예: 기술자의 손, 특정 장비)
4. **클로징 콜백**: 마지막 장면은 오프닝과 같은 상황을 "안전하게 해결된 버전"으로

### 스크립트 작성 원칙
- 광주 아파트 입주민이 실제로 검색·시청할 만한 전기 안전/점검 주제
- 3~5분 분량 (인트로/본문/마무리/CTA), 마지막에 dkansim.com 예약 유도
- 각 문단은 독립적으로 시각화 가능한 단일 장면 중심으로 작성
- **판정 결과·수치·앱 화면** 등 텍스트가 중요한 부분은 "카드/화면 전환"으로 자연스럽게 처리
- 씬당 약 8초 분량으로 내용 배분 (5~8씬 기준)
- 같은 촬영 앵글/상황 연속 반복 금지 — 장면 전환 다양성 고려

### Veo 3.1 AI 영상 생성 파이프라인 인식
이 스크립트는 Veo 3.1 AI가 씬별 영상을 자동 생성하므로:
- 각 씬 장면 묘사는 AI가 생성 가능한 실제 촬영 현장 장면으로
- 복잡한 손동작·계기판 수치·한글 텍스트가 필요한 씬은 "별도 카드 처리 예정"으로 표시
- 인물 묘사 시 외모/복장을 구체적으로 — 씬마다 일관되게 유지 예정

CMO 확성기의 마케팅 방향, CLO 규정집의 법적 주의사항을 최우선 반영하라.`,

  youtube_pd_exam: `당신은 우리집 전기주치의(대경이엔피)의 유튜브 PD 클립입니다.
"우리집 안심전기" 채널에서 전기기사/전기공사기사 자격시험 대비 + 현장 실무 노하우 강의 영상을 제작합니다.

[강의 스타일]
- 전기이론·전기기기·전기설비·전기응용 과목별 기출문제 풀이 또는 실무 노하우를 알기 쉽게 설명한다.
- 대장(채널 운영자)은 전기기사·전기공사기사 자격 보유, 아파트 전기팀장 경력을 가진 현직 전문가임을 반영하여
  교재보다 현장 감각이 담긴 설명으로 스크립트를 작성한다.
- 말투: 강의 + 동기부여 (수험생 관점에서 응원하는 선배 전기기사 말투, 친근하게)
- 구성: 인트로(주제·학습목표) → 본문(개념·문제 풀이) → 핵심 정리 → 아웃트로(구독·다음 강의 예고)

[법적 주의 — 반드시 준수]
- 한국산업인력공단 기출문제는 공공 데이터이므로 문제 자체는 인용 가능.
- 단, 사설 수험서·강의의 표현·풀이 방식을 그대로 베끼지 말 것.
- 스크립트 내에 반드시 "본인의 이해와 현장 경험을 바탕으로 재구성한 풀이"임을 자연스럽게 한 번 언급하라.

[썸네일 스타일]
- 짙은 남색(#1a2744) 배경 + 금색(#C9A227) 강조 텍스트
- 과목명 태그(예: [전기이론]) + 핵심 키워드(예: "단상교류 계산") + 합격 응원 문구
- 예시: "[전기이론] 단상교류 완전정복 🏆"
CMO 확성기의 마케팅 방향, CLO 규정집의 법적 주의사항을 최우선 반영하라.`,

  kakao_manager: `당신은 우리집 전기주치의(대경이엔피)의 카카오 매니저 톡톡입니다.
카카오 채널 포스트 기획 → 제작 → 발행 → 성과관리를 담당합니다.
- 광주 아파트 입주민 대상으로 짧고 실용적인 전기 안전 정보 + 예약 유도 콘텐츠를 작성한다.
- 포스트는 카카오톡 메시지로 바로 전달 가능한 길이(공백 포함 500자 이내)로 작성하고, 이모지를 적절히 사용한다.
- 마지막 줄에는 dkansim.com 예약 링크 안내 문구를 포함한다.
CSO 브릿지의 고객 인사이트를 최우선 반영하라.`,

  blog_editor: `당신은 우리집 전기주치의(대경이엔피)의 블로그 에디터 펜입니다.
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

export type YoutubeContentPlanItem = ContentPlanItem & { category: ContentCategory };

export type ContentPlanResult = {
  cmoDirection: string;
  csoInsight: string;
  cloNotes: string;
  /** 카테고리별 유튜브 기획 (다카테고리 지원). 단일 카테고리일 때도 배열로 반환 */
  youtubeItems: YoutubeContentPlanItem[];
  /** 하위 호환 — youtubeItems[0] */
  youtube: ContentPlanItem;
  kakao: ContentPlanItem;
  blog: ContentPlanItem[];
  summary: string;
};

function buildPlanningSystemPrompt(categories: ContentCategory[]): string {
  const ytInstruction =
    categories.length > 1
      ? `유튜브 PD 클립: 아래 카테고리별로 각 1건씩 총 ${categories.length}건 기획\n${categories.map((c) => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c]}`).join("\n")}`
      : `유튜브 PD 클립: 카테고리 "${categories[0]}" — ${CATEGORY_DESCRIPTIONS[categories[0] ?? "전기안전"]} — 1건 기획`;

  const ytJsonExample =
    categories.length > 1
      ? `"youtubeItems": [\n${categories.map((c) => `    { "title": "...", "brief": "경쟁분석 메모 + 영상 방향", "category": "${c}" }`).join(",\n")}\n  ]`
      : `"youtubeItems": [ { "title": "...", "brief": "경쟁분석 메모 + 영상 방향", "category": "${categories[0]}" } ]`;

  return `당신은 우리집 전기주치의(대경이엔피) 콘텐츠 마케팅 사령부입니다. 다음 역할을 한 번에 응답합니다:
- CMO 확성기(마케팅총괄): 이번 주 콘텐츠 방향 1~2문장
- CSO 브릿지(전략총괄): 고객 인사이트 1~2문장
- CLO 규정집(법무총괄): 이번 주 콘텐츠 제작 시 법적 주의사항 1~2문장 (없으면 "특이사항 없음")
- ${ytInstruction}
- 카카오 매니저 톡톡: 이번 주 포스트 기획 1건
- 블로그 에디터 펜: 이번 주 글 기획 최대 2건

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "cmoDirection": "...",
  "csoInsight": "...",
  "cloNotes": "...",
  ${ytJsonExample},
  "kakao": { "title": "...", "brief": "포스트 핵심 내용 한 줄" },
  "blog": [ { "title": "...", "brief": "글의 핵심 메시지", "keywords": ["키워드1", "키워드2"] } ],
  "summary": "이번 주 콘텐츠 전략 한 줄 요약"
}
\`\`\``;
}

export async function planContentWeek(
  memory: string,
  feedback: string,
  trendKeywords: string[],
  weekStatus?: WeekStatus,
  youtubeCategories?: ContentCategory[],
): Promise<ContentPlanResult> {
  const categories: ContentCategory[] = youtubeCategories?.length ? youtubeCategories : ["전기안전"];

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

  const systemPrompt = buildPlanningSystemPrompt(categories);
  const raw = await callClaudeCustom(systemPrompt, prompt, 4000, 120_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) throw new Error("콘텐츠 기획 응답에서 JSON을 파싱할 수 없습니다.");

  const parsed = JSON.parse(jsonText) as Partial<ContentPlanResult & { youtubeItems?: Partial<YoutubeContentPlanItem>[] }>;

  // youtubeItems 파싱 (신규 형식) — 구형 youtube 필드도 fallback
  const rawItems = Array.isArray(parsed.youtubeItems) ? parsed.youtubeItems : [];
  const youtubeItems: YoutubeContentPlanItem[] =
    rawItems.length > 0
      ? rawItems.map((item, idx) => ({
          title: String(item.title ?? "제목 미정"),
          brief: String(item.brief ?? ""),
          category: (item.category ?? categories[idx] ?? categories[0]) as ContentCategory,
        }))
      : [
          {
            title: String((parsed as { youtube?: { title?: string } }).youtube?.title ?? "제목 미정"),
            brief: String((parsed as { youtube?: { brief?: string } }).youtube?.brief ?? ""),
            category: categories[0],
          },
        ];

  return {
    cmoDirection: String(parsed.cmoDirection ?? ""),
    csoInsight: String(parsed.csoInsight ?? ""),
    cloNotes: String(parsed.cloNotes ?? "특이사항 없음"),
    youtubeItems,
    youtube: youtubeItems[0],
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

export type YoutubeDraft = { script: string; thumbnailConcept: string; titleCandidates: string[] };

// 스크립트 본문은 대화체 인용구(")가 많아 JSON으로 감싸면 이스케이프 오류가 자주 발생한다.
// 그래서 JSON 대신 구분자 섹션 형식으로 응답을 받는다.
const SCRIPT_SECTION_HINT = `아래 구분자 형식으로만 응답하라(JSON이 아닌 일반 텍스트, 다른 설명 없이 이 형식만):
===TITLES===
1. (4요소 공식: 대상+극단적 수식어+행위+결과에 대한 의문 — 제목 후보 1)
2. (제목 후보 2)
3. (제목 후보 3)
4. (제목 후보 4)
5. (제목 후보 5)
===SCRIPT===
(인트로/본문/마무리/CTA가 포함된 스크립트 전문)
===THUMBNAIL===
(썸네일 문구/색상/구도 설명)`;

function parseYoutubeDraft(raw: string): YoutubeDraft {
  const titlesMatch = raw.match(/===TITLES===([\s\S]*?)(?:===SCRIPT===|$)/);
  const scriptMatch = raw.match(/===SCRIPT===([\s\S]*?)(?:===THUMBNAIL===|$)/);
  const thumbnailMatch = raw.match(/===THUMBNAIL===([\s\S]*)$/);

  if (!titlesMatch && !scriptMatch && !thumbnailMatch) {
    return { script: raw.trim(), thumbnailConcept: "", titleCandidates: [] };
  }

  const titleCandidates = (titlesMatch?.[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    titleCandidates,
    script: (scriptMatch?.[1] ?? raw).trim(),
    thumbnailConcept: (thumbnailMatch?.[1] ?? "").trim(),
  };
}

export async function draftYoutubeScript(
  title: string,
  brief: string,
  weekStatus?: WeekStatus,
  category?: ContentCategory,
): Promise<YoutubeDraft> {
  const isExamPrep = category === "자격시험";
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";

  const legalNote = isExamPrep
    ? `\n[법적 주의] 기출문제 인용 시 반드시 본인의 이해와 현장 경험을 바탕으로 재구성한 풀이임을 스크립트에 자연스럽게 한 번 언급하라. 사설 수험서·강의의 표현을 그대로 쓰지 마라.`
    : "";

  const thumbnailHint = isExamPrep
    ? "썸네일: 짙은 남색 배경 + 금색 텍스트, 과목명 태그(예: [전기이론]) + 핵심 키워드 + 합격 응원 문구 스타일."
    : "썸네일: 경고 색상 카드 스타일(주황/빨강 배경, 굵은 흰색 텍스트), 전기 위험·주의 키워드 강조.";

  const prompt = `${weekLine}${BUSINESS_CONTEXT}${legalNote}
영상 제목: ${title}
기획 메모: ${brief}
카테고리: ${category ?? "전기안전"}
${thumbnailHint}

위 기획을 바탕으로 영상 스크립트와 썸네일 기획을 작성하라.
${SCRIPT_SECTION_HINT}`.trim();

  const agentId = isExamPrep ? "youtube_pd_exam" : "youtube_pd";
  const raw = await callContentAgent(agentId, prompt, 6000);
  return parseYoutubeDraft(raw);
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

// ─── 콘텐츠 성과 자가학습 분석 (일요일 07:00, 성과 리뷰 크론) ──────────────────────

export type ContentPerformanceAnalysis = {
  insights: string[];
  recommendations: string[];
  summary: string;
};

const PERFORMANCE_ANALYSIS_PROMPT = `당신은 우리집 전기주치의(대경이엔피) 콘텐츠 마케팅 사령부입니다. CFO 계산기 관점에서 이번 주 발행된 콘텐츠의 실제 성과(유튜브 조회수·좋아요·댓글, 블로그 방문)를 분석하고, 다음 주 기획에 반영할 학습 내역을 도출합니다.

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "insights": ["이번 주 성과에서 발견한 패턴 1~3개 (어떤 주제·형식이 반응이 좋았는지)"],
  "recommendations": ["다음 주 기획에 반영할 구체적 추천사항 1~3개"],
  "summary": "전체 요약 1~2문장"
}
\`\`\`
발행된 콘텐츠가 없거나 게시 직후라 통계가 0이면 insights/recommendations에 "데이터 부족 — 다음 주 발행 후 재평가 필요"와 같이 명시하고 summary도 그에 맞게 작성하라.`;

function formatPerformanceSnapshot(snapshot: {
  youtube: PerformanceSnapshotItem[];
  blog: PerformanceSnapshotItem[];
}): string {
  if (snapshot.youtube.length === 0 && snapshot.blog.length === 0) {
    return "(발행된 콘텐츠 없음)";
  }
  const lines: string[] = [];
  for (const item of snapshot.youtube) {
    lines.push(
      `- [유튜브] ${item.title} (게시 ${item.ageDays}일 경과) — 조회수 ${item.viewCount}, 좋아요 ${item.likeCount ?? 0}, 댓글 ${item.commentCount ?? 0}`,
    );
  }
  for (const item of snapshot.blog) {
    lines.push(`- [블로그] ${item.title} (게시 ${item.ageDays}일 경과) — 조회수 ${item.viewCount}`);
  }
  return lines.join("\n");
}

export async function analyzeContentPerformance(
  snapshot: { youtube: PerformanceSnapshotItem[]; blog: PerformanceSnapshotItem[] },
  priorLessons: string,
  weekStatus?: WeekStatus,
): Promise<ContentPerformanceAnalysis> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const priorBlock = priorLessons.trim() ? `\n[이전 학습 내역]\n${priorLessons.trim()}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
[이번 주 콘텐츠 성과]
${formatPerformanceSnapshot(snapshot)}
${priorBlock}
위 데이터를 분석해 학습 내역을 도출하라.`.trim();

  const raw = await callClaudeCustom(PERFORMANCE_ANALYSIS_PROMPT, prompt, 1000, 60_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) {
    return { insights: [], recommendations: [], summary: raw.trim().slice(0, 300) };
  }
  const parsed = JSON.parse(jsonText) as Partial<ContentPerformanceAnalysis>;
  return {
    insights: Array.isArray(parsed.insights) ? parsed.insights.map(String) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    summary: String(parsed.summary ?? raw.trim().slice(0, 300)),
  };
}

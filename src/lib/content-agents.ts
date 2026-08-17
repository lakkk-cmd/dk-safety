import { Agent, BUSINESS_CONTEXT, callClaude, callClaudeCustom, extractJsonBlock, isNoConcernVerdict, type WeekStatus } from "@/lib/agents";
import { checkStrategyAlignmentWithCSO } from "@/lib/advisory-gates";
import type { PerformanceSnapshotItem } from "@/lib/content-performance";
import { loadRecentSharedMemory } from "@/lib/shared-memory";

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
"우리집 전기주치의" 채널의 경쟁분석 → 콘티 설계 → 스크립트 작성 → 썸네일 기획을 담당합니다.

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
- **신뢰도 근거 최소 1회 포함**: 위험/경고 주장을 할 때는 근거를 붙여 막연한 주장으로 들리지 않게 한다.
  KEC(한국전기설비규정) 조항, 소방청 화재통계, 한국전기안전공사 자료 등 확인 가능한 출처를 스크립트 안에
  자연스러운 구어체로 인용한다 (예: "소방청 통계로도 화재 원인 1위가 전기적 요인이거든요"). 출처를 정확히
  모르면 지어내지 말고 "현장에서 자주 보는 사례로는" 같은 경험 기반 표현으로 대체한다.
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
"우리집 전기주치의" 채널에서 전기기사/전기공사기사 자격시험 대비 + 현장 실무 노하우 강의 영상을 제작합니다.

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

// ─── 디렉터 브리핑 + 마케터(CMO) 가이드라인 — 순차 위임 (월요일 09:00) ────────────────
//
// 디렉터 파이프라인 재편(Phase 1, 2026-08): 예전엔 CMO/CSO/CLO/유튜브PD/카카오매니저/
// 블로그에디터가 한 번의 호출 안에서 동시에 답하는 "병렬 롤플레이"였다. 지금은
// (1) 총괄디렉터가 CSO+CLO 관점을 자체 종합해 브리핑을 만들고 →
// (2) CMO(마케터)가 그 브리핑을 입력으로 받아 워커가 실제로 쓸 가이드라인을 만든다.
// 마케터의 산출물(tone/mustInclude/mustAvoid)은 DB의 marketer_guideline 컬럼에 저장되어
// draftYoutubeScript/draftKakaoPost/draftBlogPost(워커)의 실제 입력이 된다.

export type ContentPlanItem = {
  title: string;
  brief: string;
  keywords?: string[];
};

export type YoutubeContentPlanItem = ContentPlanItem & { category: ContentCategory };

/** 워커가 실제로 지켜야 할 제작 지침 — 마케터(CMO)가 산출하는 데이터 */
export type ContentGuideline = {
  tone: string;
  mustInclude: string[];
  mustAvoid: string[];
};

/** 총괄디렉터가 CSO(전략)+CLO(법무) 관점을 종합해 마케터에게 내리는 브리핑 */
export type DirectorContentBrief = {
  priorities: string;
  constraints: string;
  weekFocus: string;
  categories: ContentCategory[];
  /** 실제 CSO 페르소나가 브리핑을 다시 검토해 남긴 참고 메모(있을 때만) — 하드 블록 아님 */
  csoNote?: string;
};

export type MarketerYoutubeItem = YoutubeContentPlanItem & ContentGuideline;
export type MarketerContentItem = ContentPlanItem & ContentGuideline;

export type MarketerContentGuideline = {
  cmoDirection: string;
  youtubeItems: MarketerYoutubeItem[];
  kakao: MarketerContentItem;
  blog: MarketerContentItem[];
  summary: string;
};

const DIRECTOR_INTAKE_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 총괄디렉터입니다.
콘텐츠 제작에 들어가기 전, CSO 브릿지(전략총괄)와 CLO 규정집(법무총괄)의 관점을 스스로 종합해
마케터(CMO 확성기)에게 내릴 브리핑을 작성합니다. 디렉터는 산출물을 직접 만들지 않고, 마케터가
따라야 할 우선순위와 제약만 정리합니다.

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "priorities": "CSO 관점의 이번 주 우선순위/고객 인사이트 1~2문장",
  "constraints": "CLO 관점의 법적 주의사항 1~2문장 (없으면 특이사항 없음)",
  "weekFocus": "이번 주 콘텐츠가 집중해야 할 한 줄 방향"
}
\`\`\``;

/** 총괄디렉터 — CSO+CLO 관점 종합, 마케터에게 내릴 브리핑만 산출(실행 없음) */
export async function runDirectorContentIntake(
  memory: string,
  feedback: string,
  weekStatus: WeekStatus | undefined,
  youtubeCategories: ContentCategory[],
): Promise<DirectorContentBrief> {
  const weekLine = weekStatus
    ? `현재 로드맵: ${weekStatus.message}\n집중과제: ${weekStatus.yearFocus}\n`
    : "";
  const feedbackBlock = feedback.trim() ? `\n[대장 지시사항 — 반드시 반영]\n${feedback}\n` : "";
  const memoryBlock = memory ? `\n[누적 콘텐츠 기억]\n${memory}\n` : "";

  const prompt = `${weekLine}${feedbackBlock}${BUSINESS_CONTEXT}${memoryBlock}
이번 주 콘텐츠 제작에 들어가기 전 마케터에게 내릴 브리핑을 작성하라.`.trim();

  const raw = await callClaudeCustom(DIRECTOR_INTAKE_PROMPT, prompt, 700, 60_000);
  const jsonText = extractJsonBlock(raw);
  const parsed = jsonText
    ? (JSON.parse(jsonText) as Partial<Omit<DirectorContentBrief, "categories">>)
    : {};

  const priorities = String(parsed.priorities ?? "");
  const weekFocusText = String(parsed.weekFocus ?? "");

  // CSO 검증 게이트(소프트) — 디렉터가 자체 종합한 우선순위가 실제 CSO 페르소나 관점에서도
  // 로드맵과 맞는지 재확인한다. 하드 블록이 아니라 마케터(CMO) 참고 메모로만 붙인다.
  let csoNote: string | undefined;
  try {
    const cso = await checkStrategyAlignmentWithCSO(priorities, weekFocusText, weekStatus?.message);
    if (cso.concern) csoNote = cso.concern;
  } catch {
    // 경고성 검증 실패는 브리핑 생성 흐름에 영향 없음
  }

  return {
    priorities,
    constraints: String(parsed.constraints ?? "특이사항 없음"),
    weekFocus: weekFocusText,
    categories: youtubeCategories,
    csoNote,
  };
}

function buildMarketerSystemPrompt(categories: ContentCategory[]): string {
  const ytInstruction =
    categories.length > 1
      ? `유튜브 PD 클립에게 내릴 가이드라인: 아래 카테고리별로 각 1건씩 총 ${categories.length}건\n${categories.map((c) => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c]}`).join("\n")}`
      : `유튜브 PD 클립에게 내릴 가이드라인: 카테고리 "${categories[0]}" — ${CATEGORY_DESCRIPTIONS[categories[0] ?? "전기안전"]} — 1건`;

  const ytJsonExample =
    categories.length > 1
      ? `"youtubeItems": [\n${categories.map((c) => `    { "title": "...", "brief": "경쟁분석 메모 + 영상 방향", "category": "${c}", "tone": "...", "mustInclude": ["..."], "mustAvoid": ["..."] }`).join(",\n")}\n  ]`
      : `"youtubeItems": [ { "title": "...", "brief": "경쟁분석 메모 + 영상 방향", "category": "${categories[0]}", "tone": "...", "mustInclude": ["..."], "mustAvoid": ["..."] } ]`;

  return `당신은 우리집 전기주치의(대경이엔피)의 CMO 확성기(마케팅총괄)입니다.
총괄디렉터의 브리핑(우선순위·제약)을 입력으로 받아, 워커(유튜브PD·카카오매니저·블로그에디터)가
그대로 따라 제작할 수 있는 구체적 가이드라인을 작성합니다. 당신은 산출물을 직접 쓰지 않고
가이드라인만 내립니다 — tone(톤앤매너), mustInclude(반드시 포함할 요소), mustAvoid(피해야 할 표현)를
각 항목마다 명시하세요.

${ytInstruction}
- 카카오 매니저 톡톡에게 내릴 가이드라인 1건
- 블로그 에디터 펜에게 내릴 가이드라인 최대 2건

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 텍스트 없이 JSON만):
\`\`\`json
{
  "cmoDirection": "이번 주 콘텐츠 방향 1~2문장",
  ${ytJsonExample},
  "kakao": { "title": "...", "brief": "포스트 핵심 내용 한 줄", "tone": "...", "mustInclude": ["..."], "mustAvoid": ["..."] },
  "blog": [ { "title": "...", "brief": "글의 핵심 메시지", "keywords": ["키워드1", "키워드2"], "tone": "...", "mustInclude": ["..."], "mustAvoid": ["..."] } ],
  "summary": "이번 주 콘텐츠 전략 한 줄 요약"
}
\`\`\``;
}

/** CMO(마케터) — 디렉터 브리핑을 입력받아 워커용 제작 가이드라인을 산출 */
export async function runMarketerContentBrief(
  brief: DirectorContentBrief,
  trendKeywords: string[],
  weekStatus?: WeekStatus,
): Promise<MarketerContentGuideline> {
  const weekLine = weekStatus
    ? `현재 로드맵: ${weekStatus.message}\n집중과제: ${weekStatus.yearFocus}\n`
    : "";
  const trendsBlock = trendKeywords.length
    ? `\n[네이버 트렌드 키워드 상위]\n${trendKeywords.slice(0, 10).join(", ")}\n`
    : "";
  // 공유 기억(마케터/워커 맥락 확장) — 총괄디렉터가 다른 대화에서 대표님과 나눈 결정/선호를
  // CMO도 참고할 수 있게 한다. 디렉터의 브리핑이 놓친 최신 맥락과 충돌하면 CMO가 가이드라인의
  // tone/mustAvoid에 반영해 워커에게까지 자연스럽게 전달되도록 한다.
  const sharedMemory = await loadRecentSharedMemory(8).catch(() => []);
  const sharedMemoryBlock = sharedMemory.length
    ? `\n[최근 대표님 관련 맥락 — 다른 대화에서 나온 사실/결정, 참고만 할 것]\n${sharedMemory
        .map((m) => `- ${m.content}`)
        .join("\n")}\n`
    : "";

  const csoNoteBlock = brief.csoNote ? `- CSO 참고 메모(전략 정합성 우려): ${brief.csoNote}\n` : "";

  const prompt = `${weekLine}${BUSINESS_CONTEXT}${trendsBlock}${sharedMemoryBlock}
[총괄디렉터 브리핑]
- 우선순위: ${brief.priorities || "(없음)"}
- 제약(법무): ${brief.constraints}
- 이번 주 집중 방향: ${brief.weekFocus || "(없음)"}
${csoNoteBlock}
위 브리핑을 반영해 워커용 제작 가이드라인을 작성하라. 브리핑이 [최근 대표님 관련 맥락]과 명백히
충돌한다면 무시하지 말고 가이드라인의 mustAvoid/tone에 그 우려를 반영하라. CSO 참고 메모가 있다면
전략 방향 조정에 참고하라(강제 아님).`.trim();

  const systemPrompt = buildMarketerSystemPrompt(brief.categories);
  const raw = await callClaudeCustom(systemPrompt, prompt, 4000, 120_000);
  const jsonText = extractJsonBlock(raw);
  if (!jsonText) throw new Error("마케터 가이드라인 응답에서 JSON을 파싱할 수 없습니다.");

  const parsed = JSON.parse(jsonText) as Partial<
    MarketerContentGuideline & { youtubeItems?: Partial<MarketerYoutubeItem>[] }
  >;

  const toGuideline = (g: Partial<ContentGuideline> | undefined): ContentGuideline => ({
    tone: String(g?.tone ?? ""),
    mustInclude: Array.isArray(g?.mustInclude) ? g!.mustInclude!.map(String).slice(0, 6) : [],
    mustAvoid: Array.isArray(g?.mustAvoid) ? g!.mustAvoid!.map(String).slice(0, 6) : [],
  });

  const rawItems = Array.isArray(parsed.youtubeItems) ? parsed.youtubeItems : [];
  const youtubeItems: MarketerYoutubeItem[] = (rawItems.length > 0 ? rawItems : [{}]).map((item, idx) => ({
    title: String(item.title ?? "제목 미정"),
    brief: String(item.brief ?? ""),
    category: (item.category ?? brief.categories[idx] ?? brief.categories[0] ?? "전기안전") as ContentCategory,
    ...toGuideline(item),
  }));

  return {
    cmoDirection: String(parsed.cmoDirection ?? ""),
    youtubeItems,
    kakao: {
      title: String(parsed.kakao?.title ?? "제목 미정"),
      brief: String(parsed.kakao?.brief ?? ""),
      ...toGuideline(parsed.kakao),
    },
    blog: Array.isArray(parsed.blog)
      ? parsed.blog.slice(0, 2).map((b) => ({
          title: String(b.title ?? "제목 미정"),
          brief: String(b.brief ?? ""),
          keywords: Array.isArray(b.keywords) ? b.keywords.map(String).slice(0, 6) : [],
          ...toGuideline(b),
        }))
      : [],
    summary: String(parsed.summary ?? ""),
  };
}

// ─── 지시 검증 게이트 (오해 전파 방지, 2026-08) ────────────────────────────────────
//
// 총괄디렉터가 대표님과의 실시간 대화 중 잘못 이해한 내용을 그대로 콘텐츠 큐에 등록해버리면
// 워커가 그걸 그대로 실행해 완전히 엉뚱한 결과물이 나올 수 있다. CMO(마케터)가 등록 직전에
// "이 지시가 대표님의 전형적인 요청과 논리적으로 맞는가"를 한 번 검증해, 이상하면 등록을
// 막고 총괄디렉터가 대표님께 재확인하도록 되돌린다.

export type BriefVerification = { concern: string | null };

const VERIFICATION_MAX_TOKENS = 200;

/** 총괄디렉터가 채팅 중 등록하려는 콘텐츠 지시를 CMO 관점에서 검증한다 */
export async function verifyContentBriefWithMarketer(
  title: string,
  brief: string,
  category?: string,
): Promise<BriefVerification> {
  const prompt = `총괄디렉터가 다음 콘텐츠 제작 지시를 채팅 중 방금 내렸다.
제목: ${title}
기획 메모: ${brief}
카테고리: ${category ?? "미지정"}

이 지시가 대표님의 전형적인 요청 맥락(전기안전 점검·수리 출장 서비스, 광주 아파트 입주민 대상)에
비춰 논리적으로 타당한지 검토하라. 명백히 앞뒤가 안 맞거나, 전혀 다른 주제로 벗어나거나, 실행하면
곤란할 것 같은 부분이 있을 때만 그 이유를 1~2문장으로 적어라. 사소한 스타일·취향 차이로는 트집 잡지
마라 — 명백한 오해/모순으로 보일 때만 지적한다. 특별한 문제가 없으면 정확히 "이상없음"이라고만 답하라.`;

  try {
    const raw = (await callClaude("cmo", prompt, VERIFICATION_MAX_TOKENS)).trim();
    return { concern: isNoConcernVerdict(raw) ? null : raw };
  } catch {
    // 검증 자체가 실패하면(레이트리밋 등) 등록을 막지 않는다 — 안전장치가 없어서 실행이
    // 아예 안 되는 것보다는, 검증 없이 기존 동작(등록)을 유지하는 편이 낫다.
    return { concern: null };
  }
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

/** 워커 프롬프트에 마케터 가이드라인을 끼워 넣는 공통 블록 — 가이드라인이 없으면 빈 문자열 */
function formatGuidelineBlock(guideline?: Partial<ContentGuideline>): string {
  if (!guideline) return "";
  const lines: string[] = [];
  if (guideline.tone) lines.push(`- 톤앤매너: ${guideline.tone}`);
  if (guideline.mustInclude?.length) lines.push(`- 반드시 포함: ${guideline.mustInclude.join(", ")}`);
  if (guideline.mustAvoid?.length) lines.push(`- 반드시 피할 것: ${guideline.mustAvoid.join(", ")}`);
  if (lines.length === 0) return "";
  return `\n[마케터(CMO) 가이드라인 — 반드시 준수]\n${lines.join("\n")}\n`;
}

/** 워커 프롬프트에 최근 공유 기억(대표님 관련 최신 맥락)을 끼워 넣는 공통 블록 — 오해 전파 방지 게이트의
 *  일부. 마케터 가이드라인과 별개로, 워커 단계에서도 최신 맥락을 직접 참고할 수 있게 한다. */
function formatContextBlock(recentContext?: string): string {
  if (!recentContext?.trim()) return "";
  return `\n[최근 대표님 관련 맥락 — 참고, 기획 메모와 충돌하면 신중하게 반영]\n${recentContext.trim()}\n`;
}

export async function draftYoutubeScript(
  title: string,
  brief: string,
  weekStatus?: WeekStatus,
  category?: ContentCategory,
  guideline?: Partial<ContentGuideline>,
  recentContext?: string,
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
${formatGuidelineBlock(guideline)}${formatContextBlock(recentContext)}
위 기획을 바탕으로 영상 스크립트와 썸네일 기획을 작성하라.
${SCRIPT_SECTION_HINT}`.trim();

  const agentId = isExamPrep ? "youtube_pd_exam" : "youtube_pd";
  const raw = await callContentAgent(agentId, prompt, 6000);
  return parseYoutubeDraft(raw);
}

export async function draftKakaoPost(
  title: string,
  brief: string,
  weekStatus?: WeekStatus,
  guideline?: Partial<ContentGuideline>,
  recentContext?: string,
): Promise<string> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
포스트 제목: ${title}
기획 메모: ${brief}
${formatGuidelineBlock(guideline)}${formatContextBlock(recentContext)}
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
  guideline?: Partial<ContentGuideline>,
  recentContext?: string,
): Promise<BlogDraft> {
  const weekLine = weekStatus ? `${weekStatus.message}\n` : "";
  const prompt = `${weekLine}${BUSINESS_CONTEXT}
글 제목: ${title}
기획 메모: ${brief}
타깃 키워드: ${keywords.join(", ") || "(없음)"}
${formatGuidelineBlock(guideline)}${formatContextBlock(recentContext)}
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

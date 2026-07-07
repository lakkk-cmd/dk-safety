/**
 * Full(총괄) 에이전트 — tool_use 멀티턴 오케스트레이터.
 * 9개 전문 에이전트 호출 + 6개 직접 실행 도구 + 네이티브 웹검색을 자율 판단으로 사용한다.
 */

import {
  appendChatMessage,
  buildBusinessSnapshot,
  loadFullChatHistory,
  SUB_AGENT_NAMES_LINE,
} from "@/lib/agent-chat";
import {
  BUSINESS_CONTEXT,
  callClaudeWithTools,
  withCacheBreakpoint,
  type ClaudeContentBlock,
  type ClaudeMessage,
  type ToolDefinition,
  type ToolUseBlock,
} from "@/lib/agents";
import {
  SUB_AGENT_IDS,
  toolCallSubAgent,
  toolCreateContentDraft,
  toolGithubCreateIssue,
  toolGithubReadFile,
  toolKnowledgeBaseWrite,
  toolSupabaseQuery,
  toolApplySiteDecision,
  toolGenerateDocument,
  toolCreateVideoJob,
  toolGetVideoJob,
  toolCreateBlogJob,
  toolGetBlogJob,
} from "@/lib/full-agent-tools";
import { DOC_TEMPLATES } from "@/lib/document-generator";
import { ALLOWED_QUERY_TABLES } from "@/lib/safe-query";
import { searchKnowledgeChunksWithEvidence } from "@/lib/knowledge-chunks-search";
import { extractAndSaveSharedMemory } from "@/lib/shared-memory";

const MAX_TOOL_ROUNDS = 6;

/** "어떤 서브에이전트를 호출할지" 라우팅 판단만 담당 — 답변 생성(Sonnet)보다 가벼운 모델 사용 */
const ROUTING_MODEL = process.env.ANTHROPIC_ROUTING_MODEL?.trim() || "claude-haiku-4-5";

const TOOLS: ToolDefinition[] = [
  {
    name: "call_sub_agent",
    description:
      "9개 전문 에이전트(경영진 6명 + 콘텐츠팀 3명) 중 한 명에게 질문을 위임하고 답변을 받는다. 종합 답변을 만들 때 필요한 만큼 여러 번 호출할 수 있다.",
    input_schema: {
      type: "object",
      properties: {
        agent_name: { type: "string", enum: SUB_AGENT_IDS, description: "호출할 에이전트 id" },
        query: { type: "string", description: "그 에이전트에게 물어볼 질문" },
      },
      required: ["agent_name", "query"],
    },
  },
  {
    name: "github_create_issue",
    description:
      "GitHub에 코드 변경 이슈를 생성한다. auto_implement 값에 따라 자동구현 파이프라인이 즉시 시작될 수도, 사람 검토를 거칠 수도 있다 — 아래 auto_implement 설명을 반드시 읽고 신중히 판단하라.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "마크다운 본문 — 배경/제안 내용을 구체적으로" },
        auto_implement: {
          type: "boolean",
          description:
            "true로 설정하면 'ai-improvement' 라벨이 붙어 Claude Code가 즉시 구현하고, lint/build 통과 시 사람 검토 없이 자동 머지·프로덕션 배포까지 진행된다. false(기본값)면 'chat-suggestion' 라벨만 붙고 대장이 직접 라벨을 바꿔야 구현이 시작된다.\n\ntrue는 되돌리기 쉽고 범위가 좁은 저위험 변경에만 사용하라 — 오타/문구/스타일 수정, 명백한 버그 수정, UI 텍스트 변경 등.\nfalse를 사용해야 하는 경우: 가격/결제/정산 로직, 인증/권한, DB 스키마·마이그레이션, 데이터 삭제, 알림/발송 트리거, 외부 API 연동, 범위가 모호하거나 요구사항이 불충분한 요청, 또는 위험도를 확신할 수 없는 모든 경우. 판단이 서지 않으면 항상 false를 선택하라.",
        },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "github_read_file",
    description: "저장소(lakkk-cmd/dk-safety)의 파일을 읽기 전용으로 조회한다. 코드를 분석/설명할 때 사용하라.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "예: src/lib/agents.ts" },
        ref: { type: "string", description: "브랜치/커밋 (생략 시 기본 브랜치)" },
      },
      required: ["path"],
    },
  },
  {
    name: "supabase_query",
    description: `운영 데이터베이스를 읽기 전용으로 조회한다. 허용된 테이블만 조회 가능(쓰기 불가): ${ALLOWED_QUERY_TABLES.join(", ")}. 예약자/고객 연락처/결제 정보는 이 도구로 조회할 수 없다 — 그런 질문은 COO 필드에게 위임하라.`,
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", enum: ALLOWED_QUERY_TABLES as unknown as string[] },
        columns: { type: "array", items: { type: "string" } },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "in"] },
              value: {},
            },
            required: ["column", "op", "value"],
          },
        },
        orderBy: { type: "string" },
        ascending: { type: "boolean" },
        limit: { type: "number" },
      },
      required: ["table"],
    },
  },
  {
    name: "knowledge_base_write",
    description:
      "사업적으로 중요한 정보(특히 웹검색으로 찾은 최신 정보)를 지식베이스에 영구 저장한다. 다음 대화에서도 검색되어 활용된다.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        category: { type: "string", description: "예: chat_external, law, competitor 등. 생략 시 chat_external" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "apply_site_decision",
    description:
      "대화에서 확정된 결정을 site_config DB에 즉시 저장해 dkansim.com 전 페이지에 반영한다. 요금 변경(basic_price/full_price/extra_price), CTA/헤드라인 변경(hero_title/hero_subtitle/hero_cta/bottom_cta), 공지(notice_active/notice_text), 시즌 배너(season_banner/season_banner_text)가 확정됐을 때 대장 확인 없이 즉시 사용하라.",
    input_schema: {
      type: "object",
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              decision_type: { type: "string", enum: ["pricing", "cta", "notice", "service", "content", "booking"] },
              target_page: { type: "string", enum: ["main", "service", "booking", "content", "all"] },
              key: { type: "string", description: "site_config 키. 예: basic_price, hero_title, notice_active" },
              value: { type: "string", description: "새로운 값" },
              label: { type: "string", description: "관리자용 설명 (선택)" },
            },
            required: ["decision_type", "target_page", "key", "value"],
          },
        },
        session_id: { type: "string", description: "현재 대화 세션 id" },
      },
      required: ["decisions"],
    },
  },
  {
    name: "create_content_draft",
    description:
      "유튜브/카카오/블로그 콘텐츠 기획 초안을 승인 대기 큐에 등록한다 (절대 즉시 발행되지 않음 — /contents에서 대장이 검토 후 승인해야 발행됨).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["youtube", "kakao", "blog"] },
        title: { type: "string" },
        brief: { type: "string", description: "기획 메모 또는 초안 본문" },
        category: { type: "string", description: "유튜브일 때만: 전기안전/자격시험/실무" },
        keywords: { type: "array", items: { type: "string" } },
      },
      required: ["type", "title", "brief"],
    },
  },
  {
    name: "create_video_job",
    description:
      "전기안전 유튜브 영상 제작 작업을 등록한다 (dk-video-factory, 비용 0원 자체 파이프라인). 로컬 워커가 Claude 대본→TTS→모션그래픽 렌더링을 자동 처리하고, 렌더링이 끝나면 대장에게 카카오 검토 알림이 간다. 대장이 hq.dkansim.com/videos에서 승인해야만 유튜브(비공개)에 업로드된다 — 절대 즉시 게시되지 않으므로 안심하고 등록해도 된다. 단 로컬 워커 PC가 꺼져 있으면 켜질 때까지 대기 상태로 남는다.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "영상 주제 (예: '겨울철 전기장판 안전 사용법')" },
        format: { type: "string", enum: ["shorts", "standard"], description: "shorts=60초 세로 (기본값), standard=3~5분" },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_video_job",
    description: "create_video_job으로 등록한 영상 제작 작업의 진행 상태(status/미리보기/유튜브 링크/반려 사유)를 조회한다.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "create_video_job이 반환한 job_id (UUID)" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "create_blog_job",
    description:
      "네이버 블로그 원고 제작 작업을 등록한다 (dk-blog-factory, 비용 0원 자체 파이프라인). 로컬 워커가 키워드 조사→원고 작성→검증→사진 보정→썸네일까지 자동 처리하고, 완성되면 대장에게 카카오 알림이 간다. 네이버 발행은 자동화가 정책 위반이라 반드시 대장이 hq.dkansim.com/blog-jobs에서 수동으로 발행한다 — 절대 자동 게시되지 않으므로 안심하고 등록해도 된다. 로컬 워커 PC가 꺼져 있으면 켜질 때까지 대기 상태로 남는다.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "글 주제 (예: '겨울철 전기장판 화재 예방법')" },
        seed_keywords: {
          type: "array",
          items: { type: "string" },
          description: "(선택) 키워드 조사 시드 — 생략하면 topic으로 조사",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_blog_job",
    description: "create_blog_job으로 등록한 블로그 제작 작업의 진행 상태(status/원고 제목/검증 점수/발행 URL/반려 사유)를 조회한다.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "create_blog_job이 반환한 job_id (UUID)" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "generate_document",
    description:
      "점검보고서/견적서/완료확인서/안전안내문/계약서/제안서를 실제 업무용 문서로 작성해 PDF/Word 다운로드 링크를 만든다. 대장이 필요한 정보(고객명, 작업 내용, 금액 등)를 충분히 말하기 전까지는 먼저 되물어 정보를 모으고, 정보가 모이면 이 도구를 호출하라.",
    input_schema: {
      type: "object",
      properties: {
        doc_type: {
          type: "string",
          enum: Object.keys(DOC_TEMPLATES).filter((id) => id !== "custom"),
          description: "문서 유형",
        },
        user_request: { type: "string", description: "문서에 들어갈 구체적인 내용/요청 사항 전체" },
        customer_name: { type: "string" },
        reservation_id: { type: "string", description: "관련 예약 UUID (있는 경우만)" },
      },
      required: ["doc_type", "user_request"],
    },
  },
];

const FULL_AGENT_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 Full 에이전트(총괄)입니다. 경영진 6명과 콘텐츠팀 3명, 총 9명의 전문 에이전트를 실제로 호출(call_sub_agent)해서 종합 답변을 만들 수 있고, 디지털 작업을 직접 처리할 도구를 갖고 있습니다.

${SUB_AGENT_NAMES_LINE}

## 정직성 규칙 — 반드시 준수
1. **근거 없는 확정적 답변 금지** — [실시간 현황]에 참고 자료(학습된 knowledge_chunks)가 포함돼 있으면 그 내용을 우선 근거로 답변하라. 참고 자료가 없어도 일반 지식·개발 지식으로 정상 답변하는 것 자체는 전혀 문제가 아니다(이 시스템은 전기안전 외에도 마케팅/경영/IT 등 다양한 업무를 돕는다). 다만 법령 조항·구체적 수치처럼 출처가 불확실한 사실을 확정적으로 인용할 때는 "확인이 필요합니다"라고 밝혀라.
2. **미구현 기능 오안내 금지** — 이 시스템에 실제로 구현돼 있는지 확실하지 않은 기능을 "이미 가능합니다/구현돼 있습니다"라고 단정하지 마라. "만들 수 있습니다(현재는 미구현)"처럼 현재 상태와 앞으로 가능한 것을 구분해서 답하라.
3. **비용/시간 왜곡 금지** — 유료를 무료라고, 오래 걸리는 일을 즉시 된다고 안내하지 마라.
4. **모르면 모른다고 답하라** — "확인이 필요합니다"는 정직한 답변이다. 그럴듯한 추측보다 낫다.
5. **출처 태그 의무화** — 사실 정보를 인용할 때 종류를 표시하라: 📊[현황](supabase_query 등 실시간 조회 결과), 📚[지식베이스](knowledge_chunks 학습자료), 🔍[분석](데이터 기반 판단·추론), ⚠️[추정](근거 데이터 없이 추측 — 반드시 확인 후 사용하라고 함께 안내).
6. **숫자는 반드시 조회 후 답변** — 예약 건수·매출·정산 같은 운영 수치는 supabase_query로 조회한 값만 말하라. 콘텐츠 파이프라인 현황은 [실시간 현황]을 우선 근거로 삼아라. 코드/에러 관련 수치는 github_read_file로 확인하라. 조회가 불가능하면 숫자를 지어내지 말고 "현재 데이터로는 알 수 없습니다"라고 답하라.
7. **답변 끝에 검수 포인트 표기** — 사실관계를 인용한 답변(단순 인사·잡담 제외)의 마지막에 아래 형식으로 한 줄 요약을 붙여라:
   \`🔍 검수 포인트: [현황] 항목은 hq.dkansim.com에서 재확인 가능 / ⚠️[추정] 항목은 반드시 확인 후 사용\`
   (해당 태그가 답변에 없으면 그 부분은 생략)

## 작업 분류 — 매 요청마다 먼저 판단하라
1. **디지털 작업** (코드 조회/설명, 운영 데이터 조회, 콘텐츠 기획 등록, 영상 제작 등록(create_video_job)·블로그 원고 제작 등록(create_blog_job) — 둘 다 대장 승인/수동 발행 게이트가 있어 즉시 게시되지 않음, GitHub 이슈 등록) → 도구를 직접 사용해 처리한다. 코드 변경 요청은 github_create_issue로 처리하되, auto_implement는 그 도구 설명에 적힌 위험도 기준에 따라 신중히 판단하라 — 판단이 서지 않으면 항상 false.
2. **물리적 행동(촬영/현장방문/서명/통화), 외부 서비스 가입/API 키 발급, 비용이 발생하거나 법적 책임이 있는 결정** → 절대 도구로 직접 실행하지 말고, 반드시 아래 형식으로만 답변하라:
   - 왜 직접 할 수 없는지 1줄
   - 사람이 그대로 따라할 수 있는 단계별 가이드 (구체적인 클릭 경로·입력값)
   - 코드/설정 변경이 필요하면, 다음 패턴을 그대로 따르는 완성된 Claude Code 프롬프트를 마크다운 코드블록으로 제공: "작업 배경 → 번호 매긴 지시사항 → 테스트/검증 단계 → '증거 없는 완료 불인정' 문구 포함"
   - 마지막에 "완료 후 알려주시면 이어서 진행하겠습니다" 안내
3. 고객 대량 발송, 할인/쿠폰 발행처럼 비용·리스크가 크고 되돌리기 어려운 작업은 그런 도구 자체가 없다 — 절대 임의로 진행하지 말고 반드시 대장에게 확인부터 요청하라.

## 문서 작성
"점검 보고서/견적서/완료 확인서/안전 안내문/계약서/제안서 작성해줘" 같은 요청을 받으면, 문서에 필요한 정보(고객명, 작업 내용, 금액 등)가 메시지나 이전 대화에 충분히 있는지 먼저 확인하라. 부족하면 도구를 호출하지 말고 필요한 정보를 되물어라. 정보가 충분하면 generate_document를 호출하고, 결과로 받은 PDF/Word 링크를 그대로 답변에 포함해 전달하라.

## 도구 사용 원칙
- [실시간 현황]에 "[라우팅된 에이전트 의견 — 미리 호출됨]" 섹션이 있으면 이미 관련 에이전트에게 질문을 보내 받은 답변이다 — 그 의견을 우선 활용해 종합하고, 추가로 더 필요한 에이전트가 있을 때만 call_sub_agent를 추가로 호출하라.
- 종합 현황 질문은 관련된 여러 에이전트를 call_sub_agent로 호출해 답변을 모은 뒤 직접 종합하라 (단순 요약 나열이 아니라 통합된 의견으로).
- 최신 정보가 필요하다고 판단되면 묻지 않고 웹검색을 사용하라. 검색 결과 중 사업적으로 중요한 것은 knowledge_base_write로 저장하라.
- 운영 데이터가 필요하면 supabase_query를 사용하되, 허용되지 않은 테이블이나 고객 개인정보를 요구하는 질문은 COO 필드에게 위임하라.
- 대장과의 모든 대화 기록을 알고 있다고 가정하고 자연스럽게 이어서 답하라.

## 사이트 자동 반영 규칙
대화에서 아래 패턴이 확정(승인)되면 즉시 apply_site_decision 도구를 호출해 dkansim.com 전 페이지에 반영하라:
- "기본 출장점검비 / 기본 요금" 변경 → decision_type=pricing, key=basic_price
- "풀패키지 / 전체 요금" 변경 → decision_type=pricing, key=full_price
- "추가작업 요금" 변경 → decision_type=pricing, key=extra_price
- "메인 헤드라인 / 히어로 제목" 변경 → decision_type=cta, key=hero_title, target_page=main
- "서브타이틀" 변경 → decision_type=cta, key=hero_subtitle, target_page=main
- "메인 버튼 / CTA 버튼" 변경 → decision_type=cta, key=hero_cta, target_page=main
- "하단 버튼" 변경 → decision_type=cta, key=bottom_cta, target_page=main
- "공지 등록 / 공지 올리기" → decision_type=notice, key=notice_active, value=true + key=notice_text
- "공지 내리기" → decision_type=notice, key=notice_active, value=false
- "시즌 배너 / 장마 배너" → decision_type=notice, key=season_banner, value=true + key=season_banner_text
- "배너 내리기" → decision_type=notice, key=season_banner, value=false
반영 완료 후 반드시 "✅ [반영 완료] {label} → dkansim.com에 즉시 적용됐습니다" 형식으로 보고하라.

한국어로, 친근하지만 실행 가능한 수준으로 구체적으로 답하라.`;

const ROUTING_SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피) Full 에이전트의 라우팅 분류기입니다.
대장의 메시지를 보고, 답변에 필요한 전문 에이전트의 id만 골라낸다 — 실제 답변 작성은 하지 않는다.

${SUB_AGENT_NAMES_LINE}

규칙:
- 종합 현황이나 여러 부서 의견이 필요하면 관련된 에이전트를 전부 고른다.
- 코드 조회/운영 데이터 조회/콘텐츠 기획 등록/GitHub 이슈 등록처럼 총괄이 도구로 직접 처리하는 디지털 작업이면 빈 배열을 반환한다.
- 확신이 없으면 관련 가능성이 있는 에이전트를 포함한다 (누락보다 과포함이 안전하다).

설명 없이 JSON 배열만 출력하라. 예: ["cfo","coo"] 또는 []`;

/**
 * "어떤 서브에이전트를 호출할지"만 판단하는 가벼운 라우팅 단계 — 답변 생성(Sonnet)보다 저렴한
 * ROUTING_MODEL(기본 Haiku)을 쓴다. 분류 실패 시 빈 배열로 폴백해 메인 루프(Sonnet)가 그대로
 * call_sub_agent 도구로 직접 판단하게 둔다 — 라우팅 단계가 실패해도 기능이 막히지 않는다.
 */
async function classifyRoutingAgents(userMessage: string): Promise<string[]> {
  try {
    const resp = await callClaudeWithTools({
      systemPrompt: ROUTING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      model: ROUTING_MODEL,
      maxTokens: 150,
      timeoutMs: 20_000,
    });
    const text = extractText(resp.content);
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && SUB_AGENT_IDS.includes(id));
  } catch (err) {
    console.warn("[full-agent-routing] 분류 실패, 빈 배열로 폴백:", err instanceof Error ? err.message : err);
    return [];
  }
}

function findToolUseBlocks(content: ClaudeContentBlock[]): ToolUseBlock[] {
  return content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function dispatchTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "call_sub_agent":
      return toolCallSubAgent(input);
    case "github_read_file":
      return toolGithubReadFile(input);
    case "supabase_query":
      return toolSupabaseQuery(input);
    case "knowledge_base_write":
      return toolKnowledgeBaseWrite(input);
    case "create_content_draft":
      return toolCreateContentDraft(input);
    case "apply_site_decision":
      return toolApplySiteDecision(input as Parameters<typeof toolApplySiteDecision>[0]);
    case "generate_document":
      return toolGenerateDocument(input);
    case "create_video_job":
      return toolCreateVideoJob(input);
    case "get_video_job":
      return toolGetVideoJob(input);
    case "create_blog_job":
      return toolCreateBlogJob(input);
    case "get_blog_job":
      return toolGetBlogJob(input);
    default:
      return `알 수 없는 도구: ${name}`;
  }
}

export type FullAgentResult = {
  reply: string;
  usedWebSearch: boolean;
  toolCalls: { name: string; input: unknown }[];
  hasEvidence: boolean;
  evidenceSummary: string;
  ragContext: string;
  pendingImprovement?: { requestId: string; issueNumber: number };
};

const FULL_AGENT_CACHED_SYSTEM = `${FULL_AGENT_SYSTEM_PROMPT}\n\n${BUSINESS_CONTEXT}`;

export async function chatWithFullAgent(userMessage: string): Promise<FullAgentResult> {
  const [history, snapshot, routedAgentIds, evidence] = await Promise.all([
    loadFullChatHistory("general"),
    buildBusinessSnapshot(),
    classifyRoutingAgents(userMessage),
    searchKnowledgeChunksWithEvidence(userMessage).catch(
      () => ({ chunks: [], hasEvidence: false, evidenceSummary: "관련 자료 없음", contextBlock: "" })
    ),
  ]);

  const toolCalls: { name: string; input: unknown }[] = [];

  // 라우팅(Haiku)이 골라낸 에이전트를 먼저 호출해 의견을 모아둔다 — 답변 생성은 여전히 그 에이전트
  // 자신의 모델(Sonnet)이 한다. 메인 루프(Sonnet)는 이 의견을 컨텍스트로 받아 종합만 담당한다.
  let routedOpinionsText = "";
  if (routedAgentIds.length > 0) {
    const opinions = await Promise.all(
      routedAgentIds.map(async (agentId) => {
        toolCalls.push({ name: "call_sub_agent", input: { agent_name: agentId, query: userMessage } });
        const reply = await toolCallSubAgent({ agent_name: agentId, query: userMessage });
        return `[${agentId}]\n${reply}`;
      }),
    );
    routedOpinionsText = `\n\n[라우팅된 에이전트 의견 — 미리 호출됨]\n${opinions.join("\n\n")}`;
  }

  // 히스토리를 요약 없이 실제 messages 배열(role 교대)로 구성하고 마지막 히스토리 메시지에
  // 캐시 breakpoint를 찍는다 — 대화가 길어질수록(전체 기록을 매번 다시 보내는 구조) 캐시 효과가 커진다.
  const messages: ClaudeMessage[] = history.map((m) => ({ role: m.role, content: m.content }));
  if (messages.length > 0) {
    const lastIdx = messages.length - 1;
    messages[lastIdx] = { ...messages[lastIdx], content: withCacheBreakpoint(messages[lastIdx].content) };
  }
  const evidenceBlock = evidence.hasEvidence
    ? `\n\n${evidence.contextBlock}`
    : `\n\n[참고] 이 질문과 관련된 학습자료(knowledge_chunks)를 찾지 못했습니다. 답변할 수 있다면 일반 지식으로 답하되, 이 시스템에 실제로 구현되어 있는지 확실하지 않은 기능은 확정적으로 "가능합니다"라고 말하지 말고 확인이 필요하다고 밝히세요.`;

  messages.push({
    role: "user",
    content: `[실시간 현황]\n${snapshot}${routedOpinionsText}${evidenceBlock}\n\n[새 메시지]\n대장: ${userMessage}`,
  });

  let usedWebSearch = false;
  let finalText = "";
  let pendingImprovement: FullAgentResult["pendingImprovement"];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 매 라운드 전송 직전, 그 시점까지의 마지막 메시지에 캐시 breakpoint를 찍어 다음 라운드가
    // 이번 라운드의 프리픽스를 그대로 재사용(cache_read)할 수 있게 한다. messages 원본을 직접
    // 변형하지 않고 요청 본문만 복제하는 이유는, 라운드가 늘어날 때마다 breakpoint가 계속 누적되면
    // Anthropic의 요청당 캐시 breakpoint 한도(4개: system 1 + tools 1 + messages 2)를 넘기기 때문.
    const requestMessages: ClaudeMessage[] = messages.map((m, i) =>
      i === messages.length - 1 ? { ...m, content: withCacheBreakpoint(m.content) } : m,
    );

    const resp = await callClaudeWithTools({
      systemPrompt: FULL_AGENT_CACHED_SYSTEM,
      messages: requestMessages,
      tools: TOOLS,
      webSearch: true,
      maxTokens: 2048,
      timeoutMs: 90_000,
    });

    if (resp.content.some((b) => b.type === "web_search_tool_result")) usedWebSearch = true;

    if (resp.stopReason !== "tool_use") {
      finalText = extractText(resp.content) || "응답을 생성하지 못했습니다.";
      break;
    }

    const toolUseBlocks = findToolUseBlocks(resp.content);
    messages.push({ role: "assistant", content: resp.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolCalls.push({ name: block.name, input: block.input });
        if (block.name === "github_create_issue") {
          const result = await toolGithubCreateIssue(
            block.input as Parameters<typeof toolGithubCreateIssue>[0],
          );
          if (result.pendingImprovement) pendingImprovement = result.pendingImprovement;
          return { type: "tool_result" as const, tool_use_id: block.id, content: result.message };
        }
        const result = await dispatchTool(block.name, block.input);
        return { type: "tool_result" as const, tool_use_id: block.id, content: result };
      }),
    );
    messages.push({ role: "user", content: toolResults });

    if (round === MAX_TOOL_ROUNDS - 1) {
      finalText = extractText(resp.content) || "도구 호출 한도에 도달했습니다. 질문을 더 좁혀서 다시 물어봐주세요.";
    }
  }

  // assistant 메시지는 여기서 저장하지 않는다 — 호출부(route.ts)가 Gemini 검토를 거쳐 최종
  // 확정된 답변(원본 그대로/수정본/차단 메시지)을 저장해야 히스토리가 실제 화면 표시와 일치한다.
  await appendChatMessage("general", "user", userMessage);

  // 다른 에이전트도 알아야 할 정보인지 판단해 공유 메모리에 기록 — 응답 지연을 막기 위해 fire-and-forget
  void extractAndSaveSharedMemory("general", userMessage, finalText).catch(() => {});

  return {
    reply: finalText,
    usedWebSearch,
    toolCalls,
    hasEvidence: evidence.hasEvidence,
    evidenceSummary: evidence.evidenceSummary,
    ragContext: evidence.contextBlock,
    pendingImprovement,
  };
}

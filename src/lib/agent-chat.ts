import { AGENTS, BUSINESS_CONTEXT, callClaudeCustom, type Agent } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { CONTENT_AGENTS } from "@/lib/content-agents";
import { loadPerformanceLessons } from "@/lib/content-performance";
import { getHqSummary } from "@/lib/hq-summary";

// ─── 9-에이전트 채팅 ─────────────────────────────────────────────────────────────

export const CHAT_AGENTS: Agent[] = [...AGENTS, ...CONTENT_AGENTS];

export const CHAT_AGENT_GROUPS: Record<string, string[]> = {
  경영진: AGENTS.map((a) => a.id),
  콘텐츠팀: CONTENT_AGENTS.map((a) => a.id),
};

const CHAT_FRAMING = `

대장(사장님)과 1:1 대화 중입니다. 친근하고 간결하게 답하라(보통 2~5문장, 필요하면 목록 사용). 이모지를 자연스럽게 1~2개 사용해도 좋다.
아래 [실시간 현황]에 제공된 실제 데이터를 근거로 구체적으로 답하라. 현황에 없는 정보는 추측하지 말고 "현재 데이터로는 알 수 없습니다"라고 답하라.`;

const CHAT_PERSONAS: Record<string, string> = {
  cto: `당신은 우리집 전기주치의(대경이엔피)의 CTO 스파크입니다. dkansim.com(Next.js 15 + Supabase + Toss Payments), 앱(FlutterFlow + Firebase), KIPO 특허(14개 청구항)를 담당하는 기술 전문가입니다. 말투는 직설적이고 효율을 중시하며, 기술 용어를 쓸 때는 항상 1인 사업자가 바로 실행 가능한 수준으로 풀어서 설명합니다.`,
  cso: `당신은 우리집 전기주치의(대경이엔피)의 CSO 브릿지입니다. 시장 트렌드와 경영 데이터를 연결해 성장 전략을 제시하는 전략총괄로, 차분하고 분석적인 말투를 씁니다. 대장이 본업(아파트 전기팀장)을 병행하는 1인 사업자임을 항상 고려해 현실적인 우선순위를 제시합니다.`,
  cmo: `당신은 우리집 전기주치의(대경이엔피)의 CMO 확성기입니다. "우리집 안심전기" 브랜드의 콘텐츠·채널 성과를 챙기는 마케팅총괄로, 에너지 넘치고 긍정적인 말투를 씁니다. 콘텐츠 성과 데이터를 인용해 다음에 무엇을 밀어붙이면 좋을지 제안합니다.`,
  coo: `당신은 우리집 전기주치의(대경이엔피)의 COO 필드입니다. 예약→방문→완료→AS 운영 전체를 책임지는 현장형 운영총괄로, 담백하고 직설적인 말투를 씁니다. 예약/일정 현황 데이터를 근거로 오늘·이번 주 운영에서 신경 써야 할 점을 짚어줍니다.`,
  cfo: `당신은 우리집 전기주치의(대경이엔피)의 CFO 계산기입니다. 1인 사업자 수익구조와 세무를 챙기는 재무총괄로, 항상 구체적인 숫자(금액·건수·비율)로 말합니다. 감정적인 표현보다 데이터에 근거한 판단을 우선합니다.`,
  clo: `당신은 우리집 전기주치의(대경이엔피)의 CLO 규정집입니다. 겸업 제한, 전기공사업 등록 요건, 전기안전관리자 겸직 제한 등 법적 리스크를 검토하는 법무총괄로, 신중하고 보수적인 말투를 씁니다. 항상 리스크를 먼저 짚고, 합법적이고 안전한 대안을 제시합니다.`,
  youtube_pd: `당신은 우리집 전기주치의(대경이엔피)의 유튜브 PD 클립입니다. "우리집 안심전기" 유튜브 채널의 기획·제작·업로드를 담당하며, 트렌디하고 아이디어가 풍부한 말투를 씁니다. 대장이 스마트폰으로 직접 촬영 가능한 현실적인 영상 아이디어를 즐겨 제안합니다.`,
  kakao_manager: `당신은 우리집 전기주치의(대경이엔피)의 카카오 매니저 톡톡입니다. 카카오 채널 포스트를 기획·발행하는 담당자로, 친근하고 수다스러운 말투에 이모지를 자주 씁니다. 광주 아파트 입주민에게 바로 보낼 수 있는 짧고 실용적인 문구 아이디어를 잘 던집니다.`,
  blog_editor: `당신은 우리집 전기주치의(대경이엔피)의 블로그 에디터 펜입니다. dkansim.com/blog의 SEO·콘텐츠 품질을 책임지며, 꼼꼼하고 정돈된 말투를 씁니다. 키워드와 조회수 데이터를 근거로 다음에 어떤 글을 쓰면 좋을지 구체적으로 제안합니다.`,
};

const CHAT_SYSTEM_PROMPTS: Record<string, string> = Object.fromEntries(
  Object.entries(CHAT_PERSONAS).map(([id, persona]) => [id, `${persona}${CHAT_FRAMING}`]),
);

export type ChatMessage = { role: "user" | "assistant"; content: string; created_at: string };

/** 사령부 전체 현황(예약/콘텐츠 승인대기/로드맵/시장 인텔리전스/성과 학습)을 텍스트 블록으로 요약 — 9개 에이전트가 공유 */
export async function buildBusinessSnapshot(): Promise<string> {
  const summary = await getHqSummary();
  const supabase = requireAgentSupabase();
  const [intelRes, lessons] = await Promise.all([
    supabase
      .from("market_intelligence_insights")
      .select("category, trend_keywords, insight")
      .order("date", { ascending: false })
      .limit(3),
    loadPerformanceLessons().catch(() => ""),
  ]);

  const lines: string[] = [];
  lines.push(`[로드맵] ${summary.weekStatus.message}`);
  lines.push(
    `[예약 현황] 오늘 ${summary.reservations.todayCount}건 / 전체 ${summary.reservations.totalCount}건 ` +
      `(대기결제 ${summary.reservations.statusCounts.waiting_payment}건, 접수 ${summary.reservations.statusCounts.접수}건, ` +
      `진행중 ${summary.reservations.statusCounts.진행중}건, 완료 ${summary.reservations.statusCounts.완료}건, 미수금 ${summary.reservations.unpaidCount}건)`,
  );
  lines.push(
    `[콘텐츠 승인 대기] 유튜브 ${summary.content.pending.youtube}건, 카카오 ${summary.content.pending.kakao}건, 블로그 ${summary.content.pending.blog}건`,
  );
  lines.push(`[개선요청 미확인] ${summary.improvements.unacknowledged}건 / [대장 피드백 대기] ${summary.feedback.pending}건`);

  if (summary.pipeline.latest) {
    const p = summary.pipeline.latest;
    lines.push(`[최근 파이프라인] ${p.pipeline} - ${p.status} (${p.started_at})`);
  }
  if (summary.report.latest) {
    const r = summary.report.latest;
    lines.push(`[최근 보고서] ${r.date_label} - ${r.approved ? "승인됨" : "미승인"}`);
  }

  const intel = (intelRes.data ?? []) as { category: string; trend_keywords: string[]; insight: string }[];
  if (intel.length > 0) {
    lines.push("[최근 시장 인텔리전스]");
    for (const row of intel) {
      lines.push(`- ${row.category}: 키워드(${(row.trend_keywords ?? []).join(", ")}) | ${row.insight.slice(0, 150)}`);
    }
  }

  if (lessons.trim()) {
    lines.push(`[콘텐츠 성과 학습]\n${lessons.trim()}`);
  }

  return lines.join("\n");
}

export async function loadChatHistory(agentId: string, limit = 20): Promise<ChatMessage[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("agent_chat_messages")
    .select("role, content, created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ChatMessage[]).reverse();
}

export async function appendChatMessage(agentId: string, role: "user" | "assistant", content: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("agent_chat_messages").insert({ agent_id: agentId, role, content });
  if (error) throw error;
}

export async function chatWithAgent(agentId: string, userMessage: string): Promise<string> {
  const agent = CHAT_AGENTS.find((a) => a.id === agentId);
  const systemPrompt = CHAT_SYSTEM_PROMPTS[agentId];
  if (!agent || !systemPrompt) throw new Error(`알 수 없는 에이전트: ${agentId}`);

  const history = await loadChatHistory(agentId, 20);
  const snapshot = await buildBusinessSnapshot();

  const transcript = history.map((m) => `${m.role === "user" ? "대장" : agent.name}: ${m.content}`).join("\n");
  const prompt = `${BUSINESS_CONTEXT}\n\n[실시간 현황]\n${snapshot}\n\n${
    transcript ? `[이전 대화]\n${transcript}\n\n` : ""
  }[새 메시지]\n대장: ${userMessage}`;

  const reply = await callClaudeCustom(systemPrompt, prompt, 1024, 60_000);

  await appendChatMessage(agentId, "user", userMessage);
  await appendChatMessage(agentId, "assistant", reply);

  return reply;
}

/** SWOT 분석 + TOWS 전략 매트릭스 — 분기별 자동 재생성 (2026-09-06 대표님 요청) */

import { BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { buildBusinessSnapshot } from "@/lib/agent-chat";
import { loadRecentSignalsBrief } from "@/lib/recent-signals";
import { formatMemoryForPrompt, loadRecentMemory } from "@/lib/org-memory";

export type SwotItem = { title: string; description: string };
export type SwotAnalysis = {
  id: string;
  created_at: string;
  quarter_label: string;
  summary: string | null;
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
  tows_so: SwotItem[];
  tows_wo: SwotItem[];
  tows_st: SwotItem[];
  tows_wt: SwotItem[];
};

function currentQuarterLabel(): string {
  const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const quarter = Math.floor(kstNow.getMonth() / 3) + 1;
  return `${kstNow.getFullYear()} Q${quarter}`;
}

const SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 경영전략 분석가입니다.
${BUSINESS_CONTEXT}

SWOT 분석과 TOWS 전략 매트릭스를 작성합니다. 방법론:
- 강점(S)/약점(W)은 내부 요인만 담는다 — 우리가 직접 통제 가능한 것(보유 자격증, 기술력,
  운영방식, 콘텐츠 자산, 현금흐름, 인력·시간 제약 등).
- 기회(O)/위협(T)은 외부 요인만 담는다 — 우리가 직접 통제할 수 없는 것(시장 트렌드, 경쟁,
  법령·정책 변화, 계절성 등).
- 막연한 일반론이 아니라 아래 실제 데이터에서 근거를 찾을 수 있는 것만 쓴다. 각 항목의
  description에는 반드시 어떤 데이터/사실에 근거했는지 포함하라.
- TOWS 매트릭스는 SWOT 4요소를 두 개씩 결합해 4가지 실행 전략을 도출한다:
  SO(강점으로 기회 극대화) / WO(약점을 보완해 기회 활용) / ST(강점으로 위협 회피) /
  WT(약점·위협 동시 극복). 각 전략은 막연한 방향이 아니라 이번 분기 안에 실행 가능한
  구체적 행동으로 쓴다.
- [알려진 오진 주의사항 — 과거 신호에 남아있을 수 있음] "agent_reports 미승인 → 학습 안 됨"과
  "daily-business-scan pipeline_logs 좀비 레코드"는 2026-09-06에 둘 다 틀린 진단으로 확인되고
  코드까지 수정됐다. 과거 회의 요약이나 스캔 이력에 이 내용이 남아있어도 절대 액션아이템이나
  약점/위협으로 다시 꺼내지 마라.
- actionItems: 위 TOWS 전략 중 대표님 본인이 직접 외부에서 처리해야만 하는 행동만 뽑는다
  (예: 특정 기관 연락, 서류 제출, 결정/승인, 계약 확인 등). AI/에이전트가 자체 실행 가능한
  항목이나 순수 전략 방향은 넣지 마라. 없으면 빈 배열.

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 없이 JSON만, 각 배열은 4~6개 이내):
\`\`\`json
{
  "summary": "이번 분기 전략 한 줄 요약",
  "strengths": [{"title": "...", "description": "..."}],
  "weaknesses": [{"title": "...", "description": "..."}],
  "opportunities": [{"title": "...", "description": "..."}],
  "threats": [{"title": "...", "description": "..."}],
  "towsSO": [{"title": "...", "description": "..."}],
  "towsWO": [{"title": "...", "description": "..."}],
  "towsST": [{"title": "...", "description": "..."}],
  "towsWT": [{"title": "...", "description": "..."}],
  "actionItems": ["한 문장씩, 무엇을·왜 필요한지 포함"]
}
\`\`\``;

function asItems(value: unknown): SwotItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      const o = v as { title?: unknown; description?: unknown };
      return { title: String(o?.title ?? "").trim(), description: String(o?.description ?? "").trim() };
    })
    .filter((i) => i.title || i.description)
    .slice(0, 6);
}

/** SWOT/TOWS를 새로 생성해 저장하고, TOWS에서 뽑힌 대표님 액션아이템을 report_action_items에
 *  함께 저장한다(swot_analysis_id로 연결 — 홈 화면의 "대표님이 해야할 일"과 같은 테이블 공유). */
export async function runSwotAnalysis(): Promise<SwotAnalysis> {
  const [snapshot, recentSignals, recentMemory] = await Promise.all([
    buildBusinessSnapshot(),
    loadRecentSignalsBrief(90).catch(() => ""),
    loadRecentMemory({ limit: 60 }).catch(() => []),
  ]);
  const memoryPrompt = formatMemoryForPrompt(recentMemory);

  const prompt = `[사업 현황 스냅샷]
${snapshot}
${memoryPrompt ? `\n[누적 조직 기억]\n${memoryPrompt}\n` : ""}
${recentSignals?.trim() ? `\n[최근 90일 학습된 시장·지식 신호]\n${recentSignals.trim()}\n` : ""}

위 데이터를 바탕으로 이번 분기(${currentQuarterLabel()}) SWOT 분석과 TOWS 전략 매트릭스를 작성하라.`;

  // maxTokens=6000이었을 때 JSON을 끝까지 못 쓰고 잘려서(2026-09-06 확인) 8개 항목 배열이
  // 전부 비어 나온 적이 있다 — 같은 클래스의 실수를 반복하지 않도록 여유 있게 잡는다.
  const raw = await callClaudeCustom(SYSTEM_PROMPT, prompt, 8000, 170_000);
  const jsonText = extractJsonBlock(raw);
  const parsed = jsonText
    ? (JSON.parse(jsonText) as {
        summary?: string;
        strengths?: unknown;
        weaknesses?: unknown;
        opportunities?: unknown;
        threats?: unknown;
        towsSO?: unknown;
        towsWO?: unknown;
        towsST?: unknown;
        towsWT?: unknown;
        actionItems?: unknown;
      })
    : null;

  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("swot_analyses")
    .insert({
      quarter_label: currentQuarterLabel(),
      summary: parsed?.summary ?? null,
      strengths: asItems(parsed?.strengths),
      weaknesses: asItems(parsed?.weaknesses),
      opportunities: asItems(parsed?.opportunities),
      threats: asItems(parsed?.threats),
      tows_so: asItems(parsed?.towsSO),
      tows_wo: asItems(parsed?.towsWO),
      tows_st: asItems(parsed?.towsST),
      tows_wt: asItems(parsed?.towsWT),
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("swot_analyses 저장 실패");

  const actionItems = Array.isArray(parsed?.actionItems)
    ? parsed.actionItems.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 10)
    : [];
  if (actionItems.length) {
    const { error: itemsError } = await supabase
      .from("report_action_items")
      .insert(actionItems.map((content) => ({ swot_analysis_id: data.id, content })));
    if (itemsError) throw itemsError;
  }

  return data as SwotAnalysis;
}

export async function getLatestSwotAnalysis(): Promise<SwotAnalysis | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("swot_analyses")
    .select("id, created_at, quarter_label, summary, strengths, weaknesses, opportunities, threats, tows_so, tows_wo, tows_st, tows_wt")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SwotAnalysis) ?? null;
}

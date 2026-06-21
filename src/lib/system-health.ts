/** Full 에이전트 주간 자가점검 — 매주 월요일 07:00 KST 실행 */

import { BUSINESS_CONTEXT, callClaudeCustom, extractJsonBlock } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { readReservations } from "@/lib/reservations-store";

export type HealthFinding = { area: string; severity: "low" | "medium" | "high"; description: string };
export type DelegationPrompt = { title: string; prompt: string };
export type SystemHealthReport = {
  id: string;
  created_at: string;
  summary: string;
  findings: HealthFinding[];
  delegation_prompts: DelegationPrompt[];
  acknowledged: boolean;
};

const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

/** 최근 agent_reports 라운드에서 "(응답 없음)"으로 빠진 에이전트 수를 센다 (이번 세션에서 진단한 잘림 패턴 재사용) */
function countMissingAgentResponses(sections: unknown): number {
  if (!Array.isArray(sections)) return 0;
  let missing = 0;
  for (const section of sections) {
    const s = section as { round1?: { response?: string }[]; round2?: { response?: string }[] };
    for (const round of [s.round1, s.round2]) {
      for (const r of round ?? []) {
        if ((r.response ?? "").trim() === "(응답 없음)") missing += 1;
      }
    }
  }
  return missing;
}

async function gatherSignals() {
  const supabase = requireAgentSupabase();
  const since = new Date(Date.now() - DAYS_7).toISOString();

  const [feedbackRes, geminiUsageRes, pipelineFailRes, reportsRes, reservations] = await Promise.all([
    supabase.from("boss_feedback").select("content, status, created_at").gte("created_at", since),
    supabase.from("gemini_usage_log").select("cost_usd, success, operation").gte("created_at", since),
    supabase.from("pipeline_logs").select("pipeline, status, started_at, detail").eq("status", "failed").gte("started_at", since),
    supabase.from("agent_reports").select("date_label, sections, created_at").order("created_at", { ascending: false }).limit(2),
    readReservations(),
  ]);

  const ocrFailures = (feedbackRes.data ?? []).filter((f) => f.content?.includes("OCR 실패")).length;
  const geminiRows = geminiUsageRes.data ?? [];
  const geminiSpendUsd = geminiRows.filter((r) => r.success).reduce((sum, r) => sum + Number(r.cost_usd), 0);
  const geminiFailures = geminiRows.filter((r) => !r.success).length;
  const pipelineFailures = (pipelineFailRes.data ?? []).map((p) => `${p.pipeline}(${p.started_at}): ${JSON.stringify(p.detail).slice(0, 150)}`);
  const missingAgentResponses = (reportsRes.data ?? []).reduce((sum, r) => sum + countMissingAgentResponses(r.sections), 0);
  const unpaidCount = reservations.filter((r) => !r.isPaid).length;

  return {
    ocrFailures,
    geminiSpendUsd,
    geminiFailures,
    pipelineFailures,
    missingAgentResponses,
    unpaidCount,
    totalReservations: reservations.length,
  };
}

const SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 주간 시스템 점검관입니다.
${BUSINESS_CONTEXT}
지난 7일간의 시스템 신호를 분석해 실질적인 영향이 있는 문제와 개선 아이디어만 골라 보고한다. 사소한 것(0건, 정상 범위)은 findings에 넣지 않는다.

반드시 한국어로, 아래 JSON 형식으로만 응답하라(설명 없이 JSON만):
\`\`\`json
{
  "summary": "전체 한 줄 요약",
  "findings": [{"area": "예: 콘텐츠 파이프라인", "severity": "low|medium|high", "description": "구체적 설명"}],
  "delegationPrompts": [{"title": "위임 항목 제목", "prompt": "Claude Code에 그대로 붙여넣을 완성된 프롬프트 — 배경/번호 매긴 지시사항/테스트 단계/'증거 없는 완료 불인정' 문구 포함"}]
}
\`\`\`
문제가 전혀 없으면 findings를 빈 배열로, summary에 "이번 주 특이사항 없음"이라고 적는다.`;

export async function runWeeklySystemCheck(): Promise<SystemHealthReport> {
  const signals = await gatherSignals();

  const prompt = `[최근 7일 시스템 신호]
- OCR 실패 알림: ${signals.ocrFailures}건
- Gemini(Veo) 사용: 성공 비용 $${signals.geminiSpendUsd.toFixed(2)}, 실패 ${signals.geminiFailures}건
- 실패한 파이프라인: ${signals.pipelineFailures.length === 0 ? "없음" : signals.pipelineFailures.join("\n")}
- 최근 경영진 회의 2건 중 "(응답 없음)"으로 빠진 에이전트 응답 수: ${signals.missingAgentResponses}건
- 예약 미수금: ${signals.unpaidCount}건 / 전체 ${signals.totalReservations}건

위 데이터를 분석해 주간 점검 리포트를 작성하라.`;

  const raw = await callClaudeCustom(SYSTEM_PROMPT, prompt, 4000, 90_000);
  const jsonText = extractJsonBlock(raw);
  const parsed = jsonText
    ? (JSON.parse(jsonText) as { summary?: string; findings?: HealthFinding[]; delegationPrompts?: DelegationPrompt[] })
    : { summary: raw.trim().slice(0, 300), findings: [], delegationPrompts: [] };

  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("system_health_reports")
    .insert({
      summary: parsed.summary ?? "분석 실패",
      findings: parsed.findings ?? [],
      delegation_prompts: parsed.delegationPrompts ?? [],
    })
    .select("id, created_at, summary, findings, delegation_prompts, acknowledged")
    .single();
  if (error || !data) throw error ?? new Error("system_health_reports 저장 실패");

  return data as SystemHealthReport;
}

export async function getLatestSystemHealthReport(): Promise<SystemHealthReport | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("system_health_reports")
    .select("id, created_at, summary, findings, delegation_prompts, acknowledged")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SystemHealthReport) ?? null;
}

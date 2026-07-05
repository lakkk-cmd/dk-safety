/** 매일 아침 이상신호+성장기회 스캔 — 07:00 KST 실행, 카카오톡으로 발송 */

import { BUSINESS_CONTEXT, extractJsonBlock } from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import { buildBusinessSnapshot } from "@/lib/agent-chat";
import { investigateReadonly } from "@/lib/scan-investigator";

export type ScanItem = { title: string; description: string };
export type DailyBusinessScan = {
  id: string;
  created_at: string;
  summary: string;
  anomalies: ScanItem[];
  opportunities: ScanItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function gatherExtraSignals() {
  const supabase = requireAgentSupabase();
  const since = new Date(Date.now() - DAY_MS).toISOString();

  const [pipelineFailRes, validatorLogsRes, newLeadsRes] = await Promise.all([
    supabase.from("pipeline_logs").select("pipeline, started_at, detail").eq("status", "failed").gte("started_at", since),
    supabase.from("agent_logs").select("level").eq("source", "cross_validator").gte("created_at", since),
    supabase.from("consultation_logs").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);

  const validatorLogs = validatorLogsRes.data ?? [];
  const validatorTotal = validatorLogs.length;
  const validatorRejected = validatorLogs.filter((l) => l.level === "warn").length;

  return {
    pipelineFailures24h: (pipelineFailRes.data ?? []).map(
      (p) => `${p.pipeline}(${p.started_at}): ${JSON.stringify(p.detail).slice(0, 150)}`,
    ),
    validatorTotal24h: validatorTotal,
    validatorRejected24h: validatorRejected,
    newLeads24h: newLeadsRes.count ?? 0,
  };
}

const SYSTEM_PROMPT = `당신은 우리집 전기주치의(대경이엔피)의 매일 아침 사업 스캔 담당자입니다.
${BUSINESS_CONTEXT}
사업 전체 현황(예약/콘텐츠/파이프라인/시장 인텔리전스/성과 학습 등)을 하나로 보고, 아래 두 가지를 찾아낸다:
1. 이상신호(anomalies) — 즉시 확인이 필요한 문제만. 정상 범위/사소한 변동은 넣지 않는다.
2. 성장기회(opportunities) — 트렌드 키워드, 콘텐츠 공백, 매출 확대 아이디어 등 오늘 실행하면 좋을 구체적 제안. 막연한 일반론이 아니라 이 데이터에서 실제로 근거를 찾을 수 있는 것만.

[조사 도구] 아래 스냅샷 신호에서 이상한 수치나 애매한 부분을 발견하면, 결론 내리기 전에 반드시 도구로 직접 확인하라 —
숫자를 추측하거나 스냅샷 문구만으로 단정하지 마라. supabase_query로 실제 테이블을 조회해 근본 원인을 확인하고,
필요하면 github_read_file로 관련 코드를 읽어 왜 그런 값이 나오는지 확인하고, 특정 영역의 판단이 필요하면
call_sub_agent로 해당 전문 에이전트(CFO/COO 등)에게 의견을 물어라. 이 세 도구는 전부 읽기 전용이다 — 무엇을
변경하거나 실행하는 도구는 없다(그런 조치는 대장이 직접 판단해야 한다).

충분히 조사했으면, 반드시 한국어로 아래 JSON 형식으로만 최종 응답하라(설명 없이 JSON만):
\`\`\`json
{
  "summary": "오늘 한 줄 요약",
  "anomalies": [{"title": "짧은 제목", "description": "구체적 설명과 근거(직접 확인한 사실 기반)"}],
  "opportunities": [{"title": "짧은 제목", "description": "구체적 설명과 근거"}]
}
\`\`\`
둘 다 없으면 각각 빈 배열로, summary에 "오늘 특이사항 없음"이라고 적는다. 각 배열은 최대 3개까지만.`;

export async function runDailyBusinessScan(): Promise<DailyBusinessScan & { toolCallCount: number }> {
  const [snapshot, extra] = await Promise.all([buildBusinessSnapshot(), gatherExtraSignals()]);

  const prompt = `[사업 현황 스냅샷]
${snapshot}

[최근 24시간 추가 신호]
- 실패한 파이프라인: ${extra.pipelineFailures24h.length === 0 ? "없음" : extra.pipelineFailures24h.join("\n")}
- AI 교차검증: 전체 ${extra.validatorTotal24h}건 중 반려 ${extra.validatorRejected24h}건
- 신규 상담/리드 등록: ${extra.newLeads24h}건

위 데이터를 분석해 오늘 아침 스캔 리포트를 작성하라. 이상한 부분은 도구로 먼저 확인한 뒤 결론을 내려라.`;

  const { finalText, toolCalls } = await investigateReadonly(SYSTEM_PROMPT, prompt);
  const jsonText = extractJsonBlock(finalText);
  const parsed = jsonText
    ? (JSON.parse(jsonText) as { summary?: string; anomalies?: ScanItem[]; opportunities?: ScanItem[] })
    : { summary: finalText.trim().slice(0, 300) || "분석 실패", anomalies: [], opportunities: [] };

  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("daily_business_scans")
    .insert({
      summary: parsed.summary ?? "분석 실패",
      anomalies: parsed.anomalies ?? [],
      opportunities: parsed.opportunities ?? [],
    })
    .select("id, created_at, summary, anomalies, opportunities")
    .single();
  if (error || !data) throw error ?? new Error("daily_business_scans 저장 실패");

  return { ...(data as DailyBusinessScan), toolCallCount: toolCalls.length };
}

export async function getLatestDailyBusinessScan(): Promise<DailyBusinessScan | null> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("daily_business_scans")
    .select("id, created_at, summary, anomalies, opportunities")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DailyBusinessScan) ?? null;
}

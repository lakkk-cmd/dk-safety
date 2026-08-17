/**
 * 6경영진 회의에 "최근 학습된 새 정보"를 브리핑하기 위한 조회 (디렉터 파이프라인 확장, 2026-08).
 *
 * 배경: 지식베이스(knowledge)/시장 인텔리전스(market_intelligence_insights)/아침 스캔
 * (daily_business_scans)은 각자 따로 데이터를 쌓기만 하고, 정작 전략을 결정하는 6경영진
 * 회의(runFullMeeting)에는 대장 피드백 + 과거 회의 자체 요약만 들어가고 있었다 — 아무리
 * 학습해도 회의가 그 내용을 볼 방법이 없었다. 이 함수가 세 소스를 하나의 브리핑으로 합쳐
 * runFullMeeting에 참고 신호로 전달한다.
 *
 * 아침 스캔의 opportunities는 boss_feedback 테이블에 넣지 않는다 — 그 테이블은 회의 프롬프트에서
 * "[대장 지시사항 — 반드시 반영]"으로 취급되는데, AI가 스스로 발견한 가설을 대장의 명령처럼
 * 위장시키는 건 부정확하고 위험하다. 대신 이 브리핑에서 "AI 제안, 검증 필요"로 명시해 참고
 * 신호로만 전달한다.
 */

import { requireAgentSupabase } from "@/lib/agent-db";

const DAY_MS = 24 * 60 * 60 * 1000;

type KnowledgeRow = { source: string; title: string; content: string; category: string | null; is_external: boolean };
type InsightRow = { category: string; trend_keywords: string[]; insight: string };
type ScanRow = { opportunities: { title: string; description: string }[] | null };

/**
 * 지난 `days`일간 새로 학습된 지식/시장 인텔리전스/아침 스캔 성장기회를 하나의 텍스트로 합친다.
 * 셋 다 없으면 빈 문자열을 반환한다 — 호출부(runFullMeeting)가 빈 문자열이면 섹션 자체를 생략한다.
 */
export async function loadRecentSignalsBrief(days = 7): Promise<string> {
  const supabase = requireAgentSupabase();
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const sinceDate = since.slice(0, 10);

  const [knowledgeRes, insightsRes, scansRes] = await Promise.all([
    supabase
      .from("knowledge")
      .select("source, title, content, category, is_external")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("market_intelligence_insights")
      .select("category, trend_keywords, insight")
      .gte("date", sinceDate)
      .order("date", { ascending: false })
      .limit(6),
    supabase
      .from("daily_business_scans")
      .select("opportunities")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(days),
  ]);

  const parts: string[] = [];

  // ── 지식베이스 신규 학습 — 같은 문서의 여러 청크는 source 기준으로 1건만 ──
  const knowledgeRows = (knowledgeRes.data ?? []) as KnowledgeRow[];
  if (knowledgeRows.length > 0) {
    const bySource = new Map<string, KnowledgeRow>();
    for (const row of knowledgeRows) {
      if (!bySource.has(row.source)) bySource.set(row.source, row);
    }
    const lines = [...bySource.values()]
      .slice(0, 8)
      .map((r) => `- [${r.category ?? "미분류"}${r.is_external ? "·외부수집" : ""}] ${r.title}: ${r.content.slice(0, 150)}`);
    parts.push(`■ 신규 학습 자료(최근 ${days}일, 지식베이스)\n${lines.join("\n")}`);
  }

  // ── 시장 인텔리전스 ──
  const insightRows = (insightsRes.data ?? []) as InsightRow[];
  if (insightRows.length > 0) {
    const lines = insightRows.map(
      (r) => `- [${r.category}] 키워드: ${(r.trend_keywords ?? []).join(", ") || "(없음)"} | ${r.insight.slice(0, 150)}`,
    );
    parts.push(`■ 시장 인텔리전스(최근 ${days}일)\n${lines.join("\n")}`);
  }

  // ── 아침 스캔 성장기회 — AI 제안일 뿐 대장 지시가 아님을 명시 ──
  const scanRows = (scansRes.data ?? []) as ScanRow[];
  const opportunities = scanRows.flatMap((r) => r.opportunities ?? []).slice(0, 8);
  if (opportunities.length > 0) {
    const lines = opportunities.map((o) => `- ${o.title}: ${o.description}`);
    parts.push(
      `■ 아침 스캔이 발견한 성장기회(최근 ${days}일, AI 제안 — 대장 지시 아님, 타당성은 회의에서 직접 판단할 것)\n${lines.join("\n")}`,
    );
  }

  return parts.join("\n\n");
}

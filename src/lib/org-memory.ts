/**
 * 조직 통합 기억 — agent_memory_entries 테이블 하나를 주간 6인 경영진회의(decision/
 * open_question/kpi/theme/meeting_summary)와 9-에이전트 채팅(note)이 함께 쓴다.
 *
 * 배경(2026-09-06): 예전엔 agent_memory(주간회의 전용 구조화 JSON)와 agent_shared_memory
 * (채팅이 읽는 실시간 스트림)가 서로 완전히 분리돼 있어서, 한쪽 대화에서 결정한 내용을
 * 다른 쪽이 전혀 모르는 문제가 반복됐다(예: "겸업조항 확인 완료"를 총괄디렉터 채팅에는
 * 기록했는데 daily-scan/주간회의는 몰랐던 사례). 이제 전부 여기 하나로 모인다.
 */

import { requireAgentSupabase } from "@/lib/agent-db";
import { callClaudeWithTools } from "@/lib/agents";

export type MemoryCategory = "decision" | "open_question" | "kpi" | "theme" | "meeting_summary" | "note";

export type MemoryEntry = {
  id: string;
  created_at: string;
  category: MemoryCategory;
  source_agent_id: string;
  content: string;
  meta: Record<string, unknown>;
};

export async function saveMemoryEntry(params: {
  category: MemoryCategory;
  sourceAgentId: string;
  content: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const content = params.content.trim();
  if (!content) return;
  const supabase = requireAgentSupabase();
  const { error } = await supabase.from("agent_memory_entries").insert({
    category: params.category,
    source_agent_id: params.sourceAgentId,
    content: content.slice(0, 500),
    meta: params.meta ?? {},
  });
  if (error) throw error;
}

export async function loadRecentMemory(options?: {
  limit?: number;
  categories?: MemoryCategory[];
}): Promise<MemoryEntry[]> {
  const supabase = requireAgentSupabase();
  let query = supabase
    .from("agent_memory_entries")
    .select("id, created_at, category, source_agent_id, content, meta")
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 20);
  if (options?.categories?.length) query = query.in("category", options.categories);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as MemoryEntry[]).reverse();
}

/** 하위 호환 별칭 — "최근 공유 메모리"라는 기존 의미 그대로, 호출부(agent-chat.ts/
 *  full-agent.ts/content-agents.ts/content-pipeline.ts) 코드 변경 없이 통합 스트림을 읽게 한다. */
export const loadRecentSharedMemory = (limit = 15): Promise<MemoryEntry[]> => loadRecentMemory({ limit });

const EXTRACTION_MODEL = process.env.ANTHROPIC_ROUTING_MODEL?.trim() || "claude-haiku-4-5";

const EXTRACTION_SYSTEM_PROMPT = `다음은 우리집 전기주치의(대경이엔피)의 AI 에이전트와 대장(사장님) 사이의 대화 한 턴이다.
이 대화에 다른 에이전트들도 알아야 할 새로운 사실·결정사항·선호·계획이 있는지 판단하라.
있으면 한국어 한 문장(80자 이내)으로 요약해서 그것만 출력하고, 없으면 정확히 NONE 만 출력하라.
사소한 인사말, 단순 질의응답, 이미 알려진 정보의 단순 재확인은 NONE으로 처리하라.
설명 없이 요약 문장 또는 NONE만 출력하라.`;

/**
 * 대화 한 턴에서 다른 에이전트가 알아야 할 정보가 있는지 가벼운 모델(Haiku)로 판단해 저장한다.
 * 응답 지연을 만들지 않도록 호출부에서 반드시 fire-and-forget(void ...catch)으로 써야 한다.
 */
export async function extractAndSaveSharedMemory(
  agentId: string,
  userMessage: string,
  agentReply: string,
): Promise<void> {
  if (!userMessage.trim() || !agentReply.trim()) return;
  try {
    const resp = await callClaudeWithTools({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `대장: ${userMessage}\n\n에이전트(${agentId}): ${agentReply}` }],
      model: EXTRACTION_MODEL,
      maxTokens: 150,
      timeoutMs: 20_000,
    });
    const text = resp.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text || text.toUpperCase().startsWith("NONE")) return;
    await saveMemoryEntry({ category: "note", sourceAgentId: agentId, content: text });
  } catch (err) {
    console.warn("[org-memory] 공유 메모리 추출 실패:", err instanceof Error ? err.message : err);
  }
}

/** 주간 경영진회의 프롬프트에 넣을 텍스트 — 카테고리별로 묶어서 렌더링한다. */
export function formatMemoryForPrompt(entries: MemoryEntry[]): string {
  const by = (cat: MemoryCategory) => entries.filter((e) => e.category === cat).map((e) => e.content);
  const themes = by("theme");
  const decisions = by("decision");
  const kpis = by("kpi");
  const openQuestions = by("open_question");
  const meetings = entries.filter((e) => e.category === "meeting_summary");
  const notes = by("note");

  const parts: string[] = [];
  if (themes.length) parts.push(`[전략 테마]\n${themes.map((t) => `- ${t}`).join("\n")}`);
  if (decisions.length) parts.push(`[확정·합의 사항]\n${decisions.map((d) => `- ${d}`).join("\n")}`);
  if (kpis.length) parts.push(`[추적 KPI]\n${kpis.map((k) => `- ${k}`).join("\n")}`);
  if (openQuestions.length) parts.push(`[미결 질문]\n${openQuestions.map((q) => `- ${q}`).join("\n")}`);
  if (meetings.length) {
    const recent = meetings
      .slice(-5)
      .map((m) => {
        const meta = m.meta as { date?: string; topic?: string };
        return `· ${meta.date ?? m.created_at} | ${meta.topic ?? ""}: ${m.content.slice(0, 200)}`;
      })
      .join("\n");
    parts.push(`[최근 회의 요약]\n${recent}`);
  }
  if (notes.length) parts.push(`[최근 대화·메모 — 9-에이전트 채팅 전체에서 감지된 사실]\n${notes.slice(-10).map((n) => `- ${n}`).join("\n")}`);
  return parts.join("\n\n") || "(아직 누적 기억 없음)";
}

export type ChiefMemoryPatch = {
  strategicThemes?: string[];
  decisions?: string[];
  openQuestions?: string[];
  kpis?: string[];
  feedbackNotes?: string;
};

/** 총괄이 반환한 조직기억 갱신 JSON 블록 파싱 (실패 시 null) */
export function parseChiefMemoryJson(text: string): ChiefMemoryPatch | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      strategicThemes: Array.isArray(o.strategicThemes) ? o.strategicThemes.map(String) : undefined,
      decisions: Array.isArray(o.decisions) ? o.decisions.map(String) : undefined,
      openQuestions: Array.isArray(o.openQuestions) ? o.openQuestions.map(String) : undefined,
      kpis: Array.isArray(o.kpis) ? o.kpis.map(String) : undefined,
      feedbackNotes: typeof o.feedbackNotes === "string" ? o.feedbackNotes : undefined,
    };
  } catch {
    return null;
  }
}

/** parseChiefMemoryJson 결과를 각각 개별 행으로 저장한다 — 더 이상 하나의 JSON blob을 병합하지 않는다. */
export async function saveChiefMemoryPatch(patch: ChiefMemoryPatch | null): Promise<void> {
  if (!patch) return;
  const tasks: Promise<void>[] = [];
  for (const t of patch.strategicThemes ?? []) tasks.push(saveMemoryEntry({ category: "theme", sourceAgentId: "chief", content: t }));
  for (const d of patch.decisions ?? []) tasks.push(saveMemoryEntry({ category: "decision", sourceAgentId: "chief", content: d }));
  for (const q of patch.openQuestions ?? []) tasks.push(saveMemoryEntry({ category: "open_question", sourceAgentId: "chief", content: q }));
  for (const k of patch.kpis ?? []) tasks.push(saveMemoryEntry({ category: "kpi", sourceAgentId: "chief", content: k }));
  if (patch.feedbackNotes?.trim()) {
    tasks.push(saveMemoryEntry({ category: "note", sourceAgentId: "chief", content: `[대장 피드백 반영 메모] ${patch.feedbackNotes.trim()}` }));
  }
  await Promise.all(tasks);
}

export async function saveMeetingSummary(params: {
  date: string;
  topic: string;
  chiefSummary: string;
  topActions: string[];
}): Promise<void> {
  await saveMemoryEntry({
    category: "meeting_summary",
    sourceAgentId: "chief",
    content: params.chiefSummary,
    meta: { date: params.date, topic: params.topic, topActions: params.topActions },
  });
}

/**
 * 9-에이전트 공유 메모리 — 자비스가 하나의 몸/두뇌로 모든 경험을 통합하듯, 어느 에이전트와의
 * 대화에서든 감지된 핵심 사실·결정·선호를 하나의 저장소에 기록하고 buildBusinessSnapshot()을
 * 통해 9개 에이전트 전부가 다음 턴부터 참조하게 한다.
 */

import { requireAgentSupabase } from "@/lib/agent-db";
import { callClaudeWithTools } from "@/lib/agents";

const EXTRACTION_MODEL = process.env.ANTHROPIC_ROUTING_MODEL?.trim() || "claude-haiku-4-5";

export type SharedMemoryEntry = {
  content: string;
  source_agent_id: string;
  created_at: string;
};

export async function saveSharedMemory(sourceAgentId: string, content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;
  const supabase = requireAgentSupabase();
  const { error } = await supabase
    .from("agent_shared_memory")
    .insert({ source_agent_id: sourceAgentId, content: trimmed.slice(0, 300) });
  if (error) throw error;
}

export async function loadRecentSharedMemory(limit = 15): Promise<SharedMemoryEntry[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("agent_shared_memory")
    .select("content, source_agent_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as SharedMemoryEntry[]).reverse();
}

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
      messages: [
        { role: "user", content: `대장: ${userMessage}\n\n에이전트(${agentId}): ${agentReply}` },
      ],
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
    await saveSharedMemory(agentId, text);
  } catch (err) {
    console.warn("[shared-memory] 추출 실패:", err instanceof Error ? err.message : err);
  }
}

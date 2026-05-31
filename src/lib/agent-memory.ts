import { requireAgentSupabase } from "@/lib/agent-db";

export const MEMORY_KEY_LEGACY = "shared_memory";
export const MEMORY_KEY_STRUCTURED = "structured_v1";

export type StructuredMemory = {
  version: 1;
  updatedAt: string;
  strategicThemes: string[];
  decisions: string[];
  openQuestions: string[];
  kpis: string[];
  recentMeetings: MeetingMemoryEntry[];
  feedbackNotes: string;
};

export type MeetingMemoryEntry = {
  date: string;
  topic: string;
  chiefSummary: string;
  topActions: string[];
};

const EMPTY_STRUCTURED = (): StructuredMemory => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  strategicThemes: [],
  decisions: [],
  openQuestions: [],
  kpis: [],
  recentMeetings: [],
  feedbackNotes: "",
});

export function parseStructuredMemory(raw: string | null | undefined): StructuredMemory {
  if (!raw?.trim()) return EMPTY_STRUCTURED();
  try {
    const parsed = JSON.parse(raw) as Partial<StructuredMemory>;
    if (parsed.version !== 1) return EMPTY_STRUCTURED();
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      strategicThemes: Array.isArray(parsed.strategicThemes) ? parsed.strategicThemes.slice(0, 12) : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.slice(0, 20) : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.slice(0, 12) : [],
      kpis: Array.isArray(parsed.kpis) ? parsed.kpis.slice(0, 12) : [],
      recentMeetings: Array.isArray(parsed.recentMeetings) ? parsed.recentMeetings.slice(0, 15) : [],
      feedbackNotes: typeof parsed.feedbackNotes === "string" ? parsed.feedbackNotes : "",
    };
  } catch {
    return EMPTY_STRUCTURED();
  }
}

export function formatMemoryForPrompt(structured: StructuredMemory, legacyText: string): string {
  const parts: string[] = [];
  if (structured.strategicThemes.length) {
    parts.push(`[전략 테마]\n${structured.strategicThemes.map((t) => `- ${t}`).join("\n")}`);
  }
  if (structured.decisions.length) {
    parts.push(`[확정·합의 사항]\n${structured.decisions.map((d) => `- ${d}`).join("\n")}`);
  }
  if (structured.kpis.length) {
    parts.push(`[추적 KPI]\n${structured.kpis.map((k) => `- ${k}`).join("\n")}`);
  }
  if (structured.openQuestions.length) {
    parts.push(`[미결 질문]\n${structured.openQuestions.map((q) => `- ${q}`).join("\n")}`);
  }
  if (structured.feedbackNotes.trim()) {
    parts.push(`[대장 최근 지시 반영 메모]\n${structured.feedbackNotes.trim()}`);
  }
  if (structured.recentMeetings.length) {
    const recent = structured.recentMeetings
      .slice(-5)
      .map((m) => `· ${m.date} | ${m.topic}: ${m.chiefSummary.slice(0, 200)}`)
      .join("\n");
    parts.push(`[최근 회의 요약]\n${recent}`);
  }
  if (legacyText.trim()) {
    parts.push(`[레거시 로그]\n${legacyText.trim().split("\n").slice(-8).join("\n")}`);
  }
  return parts.join("\n\n") || "(아직 누적 기억 없음)";
}

export async function loadAgentMemory(): Promise<{ structured: StructuredMemory; legacy: string }> {
  const supabase = requireAgentSupabase();
  const { data: rows } = await supabase
    .from("agent_memory")
    .select("key, content")
    .in("key", [MEMORY_KEY_STRUCTURED, MEMORY_KEY_LEGACY]);

  let structured = EMPTY_STRUCTURED();
  let legacy = "";
  for (const row of rows ?? []) {
    if (row.key === MEMORY_KEY_STRUCTURED) structured = parseStructuredMemory(row.content);
    if (row.key === MEMORY_KEY_LEGACY) legacy = String(row.content ?? "");
  }
  return { structured, legacy };
}

export async function saveAgentMemory(structured: StructuredMemory, legacyLine?: string): Promise<void> {
  const supabase = requireAgentSupabase();
  const structuredPayload = {
    ...structured,
    updatedAt: new Date().toISOString(),
  };

  await supabase.from("agent_memory").upsert({
    key: MEMORY_KEY_STRUCTURED,
    content: JSON.stringify(structuredPayload),
    updated_at: new Date().toISOString(),
  });

  if (legacyLine) {
    const { data } = await supabase
      .from("agent_memory")
      .select("content")
      .eq("key", MEMORY_KEY_LEGACY)
      .maybeSingle();
    const prev = String(data?.content ?? "");
    const next = [prev, legacyLine].filter(Boolean).join("\n").split("\n").slice(-30).join("\n");
    await supabase.from("agent_memory").upsert({
      key: MEMORY_KEY_LEGACY,
      content: next,
      updated_at: new Date().toISOString(),
    });
  }
}

export type BossFeedbackRow = {
  id: string;
  content: string;
  status: "pending" | "applied";
  created_at: string;
  applied_at: string | null;
};

export async function loadPendingFeedback(): Promise<BossFeedbackRow[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("boss_feedback")
    .select("id, content, status, created_at, applied_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BossFeedbackRow[];
}

export async function markFeedbackApplied(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const supabase = requireAgentSupabase();
  const now = new Date().toISOString();
  await supabase
    .from("boss_feedback")
    .update({ status: "applied", applied_at: now })
    .in("id", ids);
}

export function mergeStructuredMemory(
  prev: StructuredMemory,
  patch: Partial<Pick<StructuredMemory, "strategicThemes" | "decisions" | "openQuestions" | "kpis" | "feedbackNotes">> & {
    meeting?: MeetingMemoryEntry;
  },
): StructuredMemory {
  const dedupe = (arr: string[], max: number) =>
    [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(-max);

  const next: StructuredMemory = {
    ...prev,
    updatedAt: new Date().toISOString(),
    strategicThemes: patch.strategicThemes
      ? dedupe([...prev.strategicThemes, ...patch.strategicThemes], 12)
      : prev.strategicThemes,
    decisions: patch.decisions ? dedupe([...prev.decisions, ...patch.decisions], 20) : prev.decisions,
    openQuestions: patch.openQuestions
      ? dedupe([...prev.openQuestions, ...patch.openQuestions], 12)
      : prev.openQuestions,
    kpis: patch.kpis ? dedupe([...prev.kpis, ...patch.kpis], 12) : prev.kpis,
    feedbackNotes: patch.feedbackNotes ?? prev.feedbackNotes,
    recentMeetings: prev.recentMeetings,
  };
  if (patch.meeting) {
    next.recentMeetings = [...prev.recentMeetings, patch.meeting].slice(-15);
  }
  return next;
}

/** 총괄이 반환한 JSON 블록 파싱 (실패 시 null) */
export function parseChiefMemoryJson(text: string): Partial<StructuredMemory> | null {
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

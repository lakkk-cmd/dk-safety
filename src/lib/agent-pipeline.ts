import {
  runDailyConsolidation,
  runFullMeeting,
  type FullMeetingResult,
} from "@/lib/agents";
import { requireAgentSupabase } from "@/lib/agent-db";
import {
  formatMemoryForPrompt,
  loadAgentMemory,
  loadPendingFeedback,
  markFeedbackApplied,
  mergeStructuredMemory,
  parseChiefMemoryJson,
  saveAgentMemory,
  type MeetingMemoryEntry,
} from "@/lib/agent-memory";

export type ReportSectionPayload = {
  topic: string;
  chief_summary: string;
  round1: { agent_id: string; agent_name: string; role: string; response: string }[];
  round2: { agent_id: string; agent_name: string; role: string; response: string }[];
};

export type DailyAgentPipelineResult = {
  dateLabel: string;
  feedbackApplied: string | null;
  feedbackIds: string[];
  chiefDailySummary: string;
  sections: ReportSectionPayload[];
};

function mapResponses(responses: FullMeetingResult["round1"]) {
  return responses.map((r) => ({
    agent_id: r.agent.id,
    agent_name: r.agent.name,
    role: r.agent.role,
    response: r.response,
  }));
}

function extractTopActions(chiefMemoryJson: string, chiefSummary: string): string[] {
  if (chiefMemoryJson) {
    try {
      const raw = JSON.parse(chiefMemoryJson) as { topActions?: string[] };
      if (Array.isArray(raw.topActions) && raw.topActions.length) {
        return raw.topActions.slice(0, 5);
      }
    } catch {
      /* fall through */
    }
  }
  const lines = chiefSummary.split("\n").filter((l) => /^\d+[\.\)]|^-|^\*/.test(l.trim()));
  return lines.slice(0, 3).map((l) => l.trim());
}

export async function runDailyAgentPipeline(
  topics: string[],
  dateLabel: string,
): Promise<DailyAgentPipelineResult> {
  const pending = await loadPendingFeedback();
  const feedbackText = pending.map((f) => f.content).join("\n---\n");
  const feedbackIds = pending.map((f) => f.id);

  const { structured, legacy } = await loadAgentMemory();
  const memoryPrompt = formatMemoryForPrompt(structured, legacy);

  const meetings: FullMeetingResult[] = [];
  for (const topic of topics) {
    console.log(`[agent-pipeline] Meeting: ${topic}`);
    meetings.push(await runFullMeeting(topic, memoryPrompt, feedbackText));
  }

  const sections: ReportSectionPayload[] = meetings.map((m) => ({
    topic: m.topic,
    chief_summary: m.chiefSummary,
    round1: mapResponses(m.round1),
    round2: mapResponses(m.round2),
  }));

  let workingMemory = structured;
  for (const m of meetings) {
    const patch = parseChiefMemoryJson(m.chiefMemoryJson || m.chiefSummary);
    const entry: MeetingMemoryEntry = {
      date: dateLabel,
      topic: m.topic,
      chiefSummary: m.chiefSummary.slice(0, 500),
      topActions: extractTopActions(m.chiefMemoryJson, m.chiefSummary),
    };
    workingMemory = mergeStructuredMemory(workingMemory, {
      ...patch,
      meeting: entry,
    });
  }

  if (feedbackText.trim()) {
    workingMemory = mergeStructuredMemory(workingMemory, {
      feedbackNotes: `[${dateLabel} 반영] ${feedbackText.slice(0, 800)}`,
    });
  }

  const consolidationRaw = await runDailyConsolidation(
    memoryPrompt,
    feedbackText,
    meetings.map((m) => ({ topic: m.topic, chiefSummary: m.chiefSummary })),
  );
  const dailyPatch = parseChiefMemoryJson(consolidationRaw);
  if (dailyPatch) {
    workingMemory = mergeStructuredMemory(workingMemory, dailyPatch);
  }

  const legacyLine = `[${dateLabel}] ${meetings.map((m) => m.topic).join(", ")} — 총괄 회의 완료`;
  await saveAgentMemory(workingMemory, legacyLine);

  if (feedbackIds.length) {
    await markFeedbackApplied(feedbackIds);
  }

  const chiefDailySummary = meetings
    .map((m, i) => `${i + 1}. ${m.topic}\n${m.chiefSummary}`)
    .join("\n\n---\n\n");

  const supabase = requireAgentSupabase();
  await supabase.from("agent_reports").insert({
    created_at: new Date().toISOString(),
    date_label: dateLabel,
    chief_summary: chiefDailySummary,
    sections,
    feedback_applied: feedbackText || null,
  });

  return {
    dateLabel,
    feedbackApplied: feedbackText || null,
    feedbackIds,
    chiefDailySummary,
    sections,
  };
}

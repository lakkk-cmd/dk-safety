import {
  getCurrentWeekStatus,
  runDailyConsolidation,
  runFullMeeting,
  type FullMeetingResult,
  type WeekStatus,
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
import { clearPendingTopics } from "@/lib/agent-schedule";
import { loadRecentSignalsBrief } from "@/lib/recent-signals";
import { loadActionItemsContext, saveActionItemsForReport } from "@/lib/report-action-items";

export type ReportSectionPayload = {
  topic: string;
  chief_summary: string;
  round1: { agent_id: string; agent_name: string; role: string; response: string }[];
  round2: { agent_id: string; agent_name: string; role: string; response: string }[];
};

export type DailyAgentPipelineResult = {
  reportId: string;
  dateLabel: string;
  feedbackApplied: string | null;
  feedbackIds: string[];
  chiefDailySummary: string;
  sections: ReportSectionPayload[];
  weekStatus: WeekStatus;
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

function extractBossActionItems(chiefMemoryJson: string): string[] {
  if (!chiefMemoryJson) return [];
  try {
    const raw = JSON.parse(chiefMemoryJson) as { bossActionItems?: unknown };
    if (Array.isArray(raw.bossActionItems)) {
      return raw.bossActionItems.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    }
  } catch {
    /* fall through */
  }
  return [];
}

export async function runDailyAgentPipeline(
  topics: string[],
  dateLabel: string,
  options?: { clearTopicsAfterRun?: boolean },
): Promise<DailyAgentPipelineResult> {
  const weekStatus = getCurrentWeekStatus();

  const pending = await loadPendingFeedback();
  const feedbackText = pending.map((f) => f.content).join("\n---\n");
  const feedbackIds = pending.map((f) => f.id);

  const { structured, legacy } = await loadAgentMemory();
  const memoryPrompt = formatMemoryForPrompt(structured, legacy);
  // 지식베이스 신규 학습/시장 인텔리전스/아침 스캔 성장기회를 회의 브리핑에 포함 — 실패해도
  // 회의 자체는 계속 진행되어야 하므로 조회 실패는 빈 문자열로 무시한다.
  const recentSignals = await loadRecentSignalsBrief().catch(() => "");
  // 대표님이 체크한 할일 완료 여부를 회의가 인지하도록 — 없으면 빈 문자열(회의는 그대로 진행)
  const bossTodoContext = await loadActionItemsContext().catch(() => "");

  const meetings: FullMeetingResult[] = [];
  for (const topic of topics) {
    console.log(`[agent-pipeline] Meeting: ${weekStatus.message} | ${topic}`);
    meetings.push(
      await runFullMeeting(topic, memoryPrompt, feedbackText, weekStatus, recentSignals, bossTodoContext),
    );
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
    const existingLines = workingMemory.feedbackNotes
      ? workingMemory.feedbackNotes.split("\n").filter(Boolean)
      : [];
    const newLines = pending.map((f) => `[${dateLabel}] ${f.content.slice(0, 200)}`);
    const merged = [...existingLines, ...newLines].slice(-5);
    workingMemory = mergeStructuredMemory(workingMemory, {
      feedbackNotes: merged.join("\n"),
    });
  }

  const consolidationRaw = await runDailyConsolidation(
    memoryPrompt,
    feedbackText,
    meetings.map((m) => ({ topic: m.topic, chiefSummary: m.chiefSummary })),
    weekStatus,
  );
  const dailyPatch = parseChiefMemoryJson(consolidationRaw);
  if (dailyPatch) {
    workingMemory = mergeStructuredMemory(workingMemory, dailyPatch);
  }

  const legacyLine = `[${dateLabel}] ${weekStatus.message} | ${meetings.map((m) => m.topic).join(", ")} — 총괄 회의 완료`;
  await saveAgentMemory(workingMemory, legacyLine);

  if (feedbackIds.length) {
    await markFeedbackApplied(feedbackIds);
  }

  if (options?.clearTopicsAfterRun) {
    await clearPendingTopics();
  }

  const chiefDailySummary =
    `${weekStatus.message}\n\n` +
    meetings.map((m, i) => `${i + 1}. ${m.topic}\n${m.chiefSummary}`).join("\n\n---\n\n");

  const supabase = requireAgentSupabase();
  const { data: reportRow, error: reportErr } = await supabase
    .from("agent_reports")
    .insert({
      created_at: new Date().toISOString(),
      date_label: dateLabel,
      chief_summary: chiefDailySummary,
      sections,
      feedback_applied: feedbackText || null,
    })
    .select("id")
    .single();
  if (reportErr || !reportRow) throw new Error(`agent_reports 저장 실패: ${reportErr?.message ?? "unknown"}`);

  const bossActionItems = meetings.flatMap((m) => extractBossActionItems(m.chiefMemoryJson));
  if (bossActionItems.length) {
    await saveActionItemsForReport(reportRow.id, bossActionItems).catch((err) =>
      console.error("[agent-pipeline] 액션아이템 저장 실패:", err),
    );
  }

  return {
    reportId: reportRow.id,
    dateLabel,
    feedbackApplied: feedbackText || null,
    feedbackIds,
    chiefDailySummary,
    sections,
    weekStatus,
  };
}

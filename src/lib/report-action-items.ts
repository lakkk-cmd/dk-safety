import { requireAgentSupabase } from "@/lib/agent-db";

export type ReportActionItem = {
  id: string;
  report_id: string;
  content: string;
  done: boolean;
  done_at: string | null;
  note: string | null;
  created_at: string;
};

/** 총괄 종합 JSON의 bossActionItems를 해당 보고서에 저장 */
export async function saveActionItemsForReport(reportId: string, items: string[]): Promise<void> {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  if (!cleaned.length) return;
  const supabase = requireAgentSupabase();
  await supabase
    .from("report_action_items")
    .insert(cleaned.map((content) => ({ report_id: reportId, content })));
}

/** 통합 할일목록 — 완료 항목도 취소선 표시용으로 계속 포함, 최신순 */
export async function listActionItems(limit = 100): Promise<ReportActionItem[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("report_action_items")
    .select("id, report_id, content, done, done_at, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReportActionItem[];
}

export async function updateActionItem(
  id: string,
  patch: { done?: boolean; note?: string },
): Promise<void> {
  const supabase = requireAgentSupabase();
  const update: Record<string, unknown> = {};
  if (typeof patch.done === "boolean") {
    update.done = patch.done;
    update.done_at = patch.done ? new Date().toISOString() : null;
  }
  if (typeof patch.note === "string") {
    update.note = patch.note.trim() || null;
  }
  if (!Object.keys(update).length) return;
  const { error } = await supabase.from("report_action_items").update(update).eq("id", id);
  if (error) throw error;
}

/** 다음 회의 프롬프트에 넣을 "대표님 할일 현황" 참고 블록 — 완료 항목 반복조언 방지 + 미완료 항목 인지 */
export async function loadActionItemsContext(limit = 30): Promise<string> {
  const items = await listActionItems(limit);
  if (!items.length) return "";
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done).slice(0, 10);
  const lines: string[] = [];
  if (pending.length) {
    lines.push("[미완료]");
    lines.push(...pending.map((i) => `- ${i.content}${i.note ? ` (대표님 메모: ${i.note})` : ""}`));
  }
  if (done.length) {
    lines.push("[완료됨 — 이미 처리됨, 같은 조언 반복하지 말 것]");
    lines.push(...done.map((i) => `- ${i.content}${i.note ? ` (대표님 메모: ${i.note})` : ""}`));
  }
  return lines.join("\n");
}

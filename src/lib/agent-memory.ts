/** 대장 피드백(boss_feedback) 상태 관리 — 조직 기억 자체는 org-memory.ts로 통합됨(2026-09-06). */

import { requireAgentSupabase } from "@/lib/agent-db";

export type BossFeedbackRow = {
  id: string;
  content: string;
  status: "pending" | "applied";
  created_at: string;
  applied_at: string | null;
};

/** 회의에 반영할 대장 피드백만 — 자동 기술알림(source='system', 과거 백필분)은 제외 */
export async function loadPendingFeedback(): Promise<BossFeedbackRow[]> {
  const supabase = requireAgentSupabase();
  const { data, error } = await supabase
    .from("boss_feedback")
    .select("id, content, status, created_at, applied_at")
    .eq("status", "pending")
    .eq("source", "user")
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

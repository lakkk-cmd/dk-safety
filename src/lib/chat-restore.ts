// 이전 대화 맥락 복원 — Supabase 직접 조회 (HTTP 미사용)
import { getAgentSupabase, isAgentSupabaseReady } from "@/lib/agent-db";

export type RestoreData = {
  restored_at: string;
  is_first_session?: boolean;
  message?: string;
  recent_sessions: Array<{
    session_id: string;
    started_at: string | null;
    ended_at: string | null;
    summary: string | null;
    completed_tasks: string[];
    pending_tasks: string[];
  }>;
  active_decisions: Array<{
    category: string;
    title: string;
    content: string;
    decided_at: string | null;
  }>;
  latest_pending_tasks: string[];
  latest_messages: Array<{
    role: string;
    content: string;
    created_at: string;
  }>;
  context_snapshot: object | null;
};

/** Supabase 직접 조회 → 구조화된 복원 데이터 반환 */
export async function fetchRestoreData(): Promise<RestoreData> {
  const restored_at = new Date().toISOString();

  if (!isAgentSupabaseReady()) {
    return {
      restored_at,
      is_first_session: true,
      message: "Supabase가 설정되지 않았습니다.",
      recent_sessions: [],
      active_decisions: [],
      latest_pending_tasks: [],
      latest_messages: [],
      context_snapshot: null,
    };
  }

  const supabase = getAgentSupabase()!;

  // ① 최근 10개 세션 요약
  const { data: sessions, error: sessErr } = await supabase
    .from("chat_sessions")
    .select("session_id, started_at, ended_at, summary, completed_tasks, pending_tasks, context_snapshot")
    .order("started_at", { ascending: false })
    .limit(10);
  if (sessErr) throw new Error(`세션 조회 실패: ${sessErr.message}`);

  if (!sessions || sessions.length === 0) {
    return {
      restored_at,
      is_first_session: true,
      message: "첫 대화입니다",
      recent_sessions: [],
      active_decisions: [],
      latest_pending_tasks: [],
      latest_messages: [],
      context_snapshot: null,
    };
  }

  // ② 활성 핵심 결정 사항
  const { data: decisions, error: decErr } = await supabase
    .from("key_decisions")
    .select("category, title, content, decided_at")
    .eq("is_active", true)
    .order("decided_at", { ascending: false });
  if (decErr) throw new Error(`결정사항 조회 실패: ${decErr.message}`);

  // ③ 가장 최근 세션의 미완료 작업 + context_snapshot
  const latestSession = sessions[0] as {
    session_id: string;
    started_at: string | null;
    ended_at: string | null;
    summary: string | null;
    completed_tasks: string[] | null;
    pending_tasks: string[] | null;
    context_snapshot: object | null;
  };
  const latestPendingTasks = (latestSession.pending_tasks ?? []) as string[];
  const contextSnapshot = latestSession.context_snapshot ?? null;

  // ④ 가장 최근 세션의 마지막 메시지 20개
  const { data: messages, error: msgErr } = await supabase
    .from("chat_messages")
    .select("role, content, tool_calls, created_at")
    .eq("session_id", latestSession.session_id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (msgErr) throw new Error(`메시지 조회 실패: ${msgErr.message}`);

  // 최신→과거 순이므로 역정렬해서 반환
  const latestMessages = (
    (messages ?? []) as Array<{ role: string; content: string; created_at: string }>
  ).reverse();

  return {
    restored_at,
    recent_sessions: sessions.map((s) => {
      const row = s as typeof latestSession;
      return {
        session_id: row.session_id,
        started_at: row.started_at,
        ended_at: row.ended_at,
        summary: row.summary,
        completed_tasks: (row.completed_tasks ?? []) as string[],
        pending_tasks: (row.pending_tasks ?? []) as string[],
      };
    }),
    active_decisions: (
      (decisions ?? []) as Array<{
        category: string;
        title: string;
        content: string;
        decided_at: string | null;
      }>
    ),
    latest_pending_tasks: latestPendingTasks,
    latest_messages: latestMessages,
    context_snapshot: contextSnapshot,
  };
}

/** 복원 데이터 → 시스템 프롬프트 주입용 텍스트 블록 */
export async function buildRestoreContext(): Promise<string> {
  try {
    const data = await fetchRestoreData();
    if (data.is_first_session) return "";

    const lines: string[] = ["[이전 대화 복원]"];

    const latest = data.recent_sessions[0];
    if (latest?.ended_at) {
      lines.push(`- 마지막 대화: ${latest.ended_at.replace("T", " ").slice(0, 16)} (KST 기준 +9h)`);
    }

    if (data.active_decisions.length > 0) {
      lines.push("- 핵심 결정 사항:");
      for (const d of data.active_decisions.slice(0, 10)) {
        lines.push(`  · [${d.category}] ${d.title} — ${d.content.slice(0, 80)}`);
      }
    }

    if (data.latest_pending_tasks.length > 0) {
      lines.push("- 미완료 작업:");
      for (const t of data.latest_pending_tasks) {
        lines.push(`  · ${t}`);
      }
    }

    if (latest?.summary) {
      lines.push(`- 최근 대화 요약: ${latest.summary}`);
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

/** 대화 종료 시 호출 — 요약 생성 + 전체 저장 (server-side only) */
export async function saveAndSummarize(
  session_id: string,
  messages: { role: string; content: string }[],
): Promise<void> {
  const secret = process.env.AGENT_WRITE_SECRET?.trim();
  if (!secret) return;

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  };

  // ① 요약 생성 (5개 미만이면 summary 라우트에서 skip 처리됨)
  await fetch(`${baseUrl}/api/chat/summary`, {
    method: "POST",
    headers,
    body: JSON.stringify({ session_id, messages }),
  }).catch(() => {});

  // ② 전체 메시지 저장
  await fetch(`${baseUrl}/api/chat/save`, {
    method: "POST",
    headers,
    body: JSON.stringify({ session_id, messages }),
  }).catch(() => {});
}

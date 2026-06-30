import { requireAgentSupabase } from "@/lib/agent-db";
import { logAgentEvent } from "@/lib/pipeline-logs";

export const ALLOWED_TABLES = new Set([
  // 기존 허용 테이블
  "content_youtube_queue", "content_kakao_queue", "blog_posts",
  "agent_reports", "pipeline_logs", "agent_logs", "market_intelligence_insights",
  "boss_feedback", "improvement_requests", "gemini_usage_log", "agent_memory",
  "system_health_reports",
  // 신규 추가
  "knowledge_chunks", "knowledge_base", "reservations",
  "customers", "payments", "notifications", "coupons", "notification_logs",
  // 대화 저장/복원
  "chat_sessions", "chat_messages", "key_decisions",
]);

export type QueryOptions = {
  columns?: string | string[];
  filters?: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
  ascending?: boolean;
};

export type WriteAction = "insert" | "update" | "delete";

export type WriteData = {
  payload?: Record<string, unknown> | Record<string, unknown>[];
  filters?: Record<string, unknown>;
};

export type QueryResult = { data: unknown[]; count: number; error: string | null };
export type WriteResult = { data: unknown; affected_rows: number; error: string | null };

export async function executeQuery(table: string, options: QueryOptions = {}): Promise<QueryResult> {
  if (!ALLOWED_TABLES.has(table)) {
    return { data: [], count: 0, error: `허용되지 않은 테이블: ${table}` };
  }
  try {
    const supabase = requireAgentSupabase();
    const cols = Array.isArray(options.columns) ? options.columns.join(", ") : (options.columns ?? "*");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select(cols, { count: "exact" });
    for (const [k, v] of Object.entries(options.filters ?? {})) q = q.eq(k, v);
    if (options.orderBy) q = q.order(options.orderBy, { ascending: options.ascending ?? false });
    if (options.limit) q = q.limit(options.limit);
    const { data, error, count } = await q;
    if (error) return { data: [], count: 0, error: error.message };
    return { data: data ?? [], count: count ?? 0, error: null };
  } catch (err) {
    return { data: [], count: 0, error: err instanceof Error ? err.message : "쿼리 실패" };
  }
}

export async function executeWrite(table: string, action: WriteAction, writeData: WriteData): Promise<WriteResult> {
  if (!ALLOWED_TABLES.has(table)) {
    return { data: null, affected_rows: 0, error: `허용되지 않은 테이블: ${table}` };
  }
  await logAgentEvent("info", "supabase-agent", `${action.toUpperCase()} → ${table}`, {
    table, action, filter_keys: Object.keys(writeData.filters ?? {}),
  });
  try {
    const supabase = requireAgentSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any;
    if (action === "insert") {
      q = supabase.from(table).insert(writeData.payload as Record<string, unknown>).select();
    } else if (action === "update") {
      if (!writeData.filters) return { data: null, affected_rows: 0, error: "update에는 filters가 필요합니다." };
      q = supabase.from(table).update(writeData.payload as Record<string, unknown>);
      for (const [k, v] of Object.entries(writeData.filters)) q = q.eq(k, v);
      q = q.select();
    } else {
      if (!writeData.filters) return { data: null, affected_rows: 0, error: "delete에는 filters가 필요합니다." };
      q = supabase.from(table).delete();
      for (const [k, v] of Object.entries(writeData.filters)) q = q.eq(k, v);
      q = q.select();
    }
    const { data, error } = await q;
    if (error) return { data: null, affected_rows: 0, error: error.message };
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return { data: rows, affected_rows: rows.length, error: null };
  } catch (err) {
    return { data: null, affected_rows: 0, error: err instanceof Error ? err.message : "쓰기 실패" };
  }
}

/**
 * Full 에이전트의 supabase_query 도구 전용 — 화이트리스트 테이블만 SELECT 가능.
 * 원시 SQL을 받지 않고 Supabase JS `.select()` 빌더만 사용하므로 쓰기/SQL인젝션이 구조적으로 불가능.
 * 고객 PII(예약/연락처), 결제, OAuth 토큰이 포함된 테이블은 절대 포함하지 않는다.
 */

import { requireAgentSupabase } from "@/lib/agent-db";

export const ALLOWED_QUERY_TABLES = [
  "content_youtube_queue",
  "content_kakao_queue",
  "blog_posts",
  "agent_reports",
  "pipeline_logs",
  "agent_logs",
  "market_intelligence_insights",
  "boss_feedback",
  "improvement_requests",
  "gemini_usage_log",
  "agent_memory",
  "system_health_reports",
  // 대화 저장/복원
  "chat_sessions",
  "chat_messages",
  "key_decisions",
] as const;

export type AllowedQueryTable = (typeof ALLOWED_QUERY_TABLES)[number];

const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "in"] as const;
type FilterOp = (typeof FILTER_OPS)[number];

export type QueryFilter = { column: string; op: FilterOp; value: unknown };

export type SafeQueryParams = {
  table: string;
  columns?: string[];
  filters?: QueryFilter[];
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
};

const MAX_LIMIT = 50;

function isAllowedTable(table: string): table is AllowedQueryTable {
  return (ALLOWED_QUERY_TABLES as readonly string[]).includes(table);
}

/** 컬럼명/오더바이 식별자에 SQL 식별자 외 문자가 섞이지 않도록 검증 (PostgREST 빌더 인자 안전마진) */
function isSafeIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export async function runSafeQuery(params: SafeQueryParams): Promise<{ rows: unknown[] } | { error: string }> {
  const { table, columns, filters, orderBy, ascending, limit } = params;

  if (!isAllowedTable(table)) {
    return { error: `허용되지 않은 테이블입니다: ${table}. 허용 목록: ${ALLOWED_QUERY_TABLES.join(", ")}` };
  }
  const selectCols = (columns?.length ? columns : ["*"]).filter((c) => c === "*" || isSafeIdentifier(c));
  if (selectCols.length === 0) selectCols.push("*");

  const supabase = requireAgentSupabase();
  let query = supabase.from(table).select(selectCols.join(","));

  for (const f of filters ?? []) {
    if (!isSafeIdentifier(f.column) || !FILTER_OPS.includes(f.op)) continue;
    const value = f.value as string | number | boolean;
    switch (f.op) {
      case "eq": query = query.eq(f.column, value); break;
      case "neq": query = query.neq(f.column, value); break;
      case "gt": query = query.gt(f.column, value); break;
      case "gte": query = query.gte(f.column, value); break;
      case "lt": query = query.lt(f.column, value); break;
      case "lte": query = query.lte(f.column, value); break;
      case "like": query = query.like(f.column, String(value)); break;
      case "in": query = query.in(f.column, Array.isArray(f.value) ? f.value : [value]); break;
    }
  }

  if (orderBy && isSafeIdentifier(orderBy)) {
    query = query.order(orderBy, { ascending: ascending ?? false });
  }

  query = query.limit(Math.min(limit ?? 20, MAX_LIMIT));

  const { data, error } = await query;
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}

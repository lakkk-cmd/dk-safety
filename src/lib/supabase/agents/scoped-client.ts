/**
 * 역할별 스코프드 Supabase 클라이언트 팩토리 — Issue #23
 *
 * `requireAgentSupabase()`(Service Role)를 감싸, 호출 역할(AgentRole)에 허용된
 * 테이블·연산만 통과시키는 가드 프록시를 반환한다. 권한 밖의 `.from(table).insert()`,
 * `.delete()`, `.rpc()` 등은 런타임에서 `AgentAccessError`를 던져 데이터 무결성을 보호한다.
 *
 * Service Role Key는 RLS를 우회하므로 DB 계층에서 막을 수 없는 오작동(예: 읽기 전용
 * 리포트 에이전트가 실수로 예약을 삭제)을 애플리케이션 계층에서 차단하는 방어선이다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAgentSupabase } from "@/lib/agent-db";
import {
  AGENT_ROLE,
  isOperationAllowed,
  isRpcAllowed,
  type AgentRole,
  type TableOperation,
} from "@/lib/supabase/agents/roles";

export class AgentAccessError extends Error {
  constructor(
    message: string,
    readonly role: AgentRole,
    readonly table: string | null,
    readonly operation: string,
  ) {
    super(message);
    this.name = "AgentAccessError";
  }
}

const GUARDED_OPS: readonly TableOperation[] = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
];

const BLOCKED_SERVICE_SURFACES = new Set(["auth", "storage", "functions", "realtime"]);
const BLOCKED_SERVICE_METHODS = new Set(["channel", "getChannels", "removeChannel", "removeAllChannels"]);
const ALLOWED_SCHEMA = "public";

function isGuardedOp(prop: string): prop is TableOperation {
  return (GUARDED_OPS as readonly string[]).includes(prop);
}

/** `.from(table)` 가 반환한 쿼리 빌더를 감싸 첫 연산(select/insert/...)을 가드한다. */
function guardQueryBuilder(role: AgentRole, table: string, builder: object): object {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && isGuardedOp(prop) && typeof value === "function") {
        if (!isOperationAllowed(role, table, prop)) {
          throw new AgentAccessError(
            `[${role}] 테이블 "${table}" 에 대한 "${prop}" 연산이 허용되지 않습니다.`,
            role,
            table,
            prop,
          );
        }
      }
      // 함수는 원본 빌더에 바인딩해 체이닝(.eq/.order/...)이 정상 동작하도록 한다.
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function guardRpc(role: AgentRole, fn: string, call: () => unknown): unknown {
  if (!isRpcAllowed(role, fn)) {
    throw new AgentAccessError(
      `[${role}] RPC 함수 "${fn}" 호출이 허용되지 않습니다.`,
      role,
      null,
      `rpc:${fn}`,
    );
  }
  return call();
}

function assertSchemaAllowed(role: AgentRole, schema: string): void {
  if (schema === ALLOWED_SCHEMA) return;

  throw new AgentAccessError(
    `[${role}] Supabase schema "${schema}" 접근은 역할 스코프드 DB 클라이언트에서 허용되지 않습니다.`,
    role,
    null,
    `schema:${schema}`,
  );
}

/**
 * PostgREST 표면(`client`, `client.rest`, `client.schema(...)`)을 동일하게 가드한다.
 * `rest`/`schema`를 그대로 노출하면 `.from()` 가드를 우회할 수 있으므로 반드시 재귀적으로 감싼다.
 */
function guardPostgrestSurface(role: AgentRole, surface: object): object {
  return new Proxy(surface, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) =>
          guardQueryBuilder(role, table, (target as { from: (table: string) => object }).from(table));
      }
      if (prop === "rpc") {
        return (fn: string, ...rest: unknown[]) =>
          guardRpc(role, fn, () =>
            (target as { rpc: (fn: string, ...args: unknown[]) => unknown }).rpc(fn, ...rest),
          );
      }
      if (prop === "schema") {
        return (schema: string) => {
          assertSchemaAllowed(role, schema);
          return guardPostgrestSurface(role, (target as { schema: (schema: string) => object }).schema(schema));
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * 역할 스코프가 적용된 Supabase 클라이언트를 만든다.
 * ADMIN 역할은 가드 없이 Service Role 클라이언트를 그대로 반환한다.
 */
export function createScopedAgentClient(role: AgentRole): SupabaseClient {
  return scopeAgentClient(requireAgentSupabase(), role);
}

export function scopeAgentClient(client: SupabaseClient, role: AgentRole): SupabaseClient {
  if (role === AGENT_ROLE.ADMIN) {
    return client;
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => guardQueryBuilder(role, table, target.from(table)) as never;
      }
      if (prop === "rpc") {
        return (fn: string, ...rest: unknown[]) => {
          return guardRpc(role, fn, () =>
            (target.rpc as (fn: string, ...args: unknown[]) => unknown)(fn, ...rest),
          );
        };
      }
      if (prop === "schema") {
        return (schema: string) => {
          assertSchemaAllowed(role, schema);
          return guardPostgrestSurface(role, target.schema(schema));
        };
      }
      if (prop === "rest") {
        return guardPostgrestSurface(role, Reflect.get(target, "rest", receiver) as object);
      }
      if (typeof prop === "string" && BLOCKED_SERVICE_SURFACES.has(prop)) {
        throw new AgentAccessError(
          `[${role}] Supabase "${prop}" 서비스 접근은 역할 스코프드 DB 클라이언트에서 허용되지 않습니다.`,
          role,
          null,
          prop,
        );
      }
      if (typeof prop === "string" && BLOCKED_SERVICE_METHODS.has(prop)) {
        throw new AgentAccessError(
          `[${role}] Supabase "${prop}" 서비스 호출은 역할 스코프드 DB 클라이언트에서 허용되지 않습니다.`,
          role,
          null,
          prop,
        );
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SupabaseClient;
}

/** 읽기 전용 에이전트(리포트/통계/알림 판단) */
export function readOnlyAgent(): SupabaseClient {
  return createScopedAgentClient(AGENT_ROLE.READ_ONLY);
}

/** 예약/작업 기록 에이전트 (이슈의 visitWriter) */
export function reservationWriterAgent(): SupabaseClient {
  return createScopedAgentClient(AGENT_ROLE.RESERVATION_WRITER);
}

/** 결제/보증서 기록 에이전트 */
export function paymentWriterAgent(): SupabaseClient {
  return createScopedAgentClient(AGENT_ROLE.PAYMENT_WRITER);
}

/** 콘텐츠 마케팅 에이전트 */
export function contentWriterAgent(): SupabaseClient {
  return createScopedAgentClient(AGENT_ROLE.CONTENT_WRITER);
}

/** hq 대장 전용 — 전체 CRUD. 절대 클라이언트(브라우저)로 노출 금지. */
export function adminAgent(): SupabaseClient {
  return createScopedAgentClient(AGENT_ROLE.ADMIN);
}

/**
 * 에이전트 역할 기반 접근 제어(RBAC) 정의 — Issue #23
 *
 * 이 저장소의 모든 서버 사이드 Supabase 접근은 Service Role Key를 사용하므로
 * Postgres RLS는 우회된다(`getAgentSupabase`/`getSupabaseAdmin` 참고). 또한 이 앱은
 * Supabase Auth를 쓰지 않고 자체 쿠키 인증(admin/resident/worker)을 사용하므로
 * `auth.uid()`/`auth.jwt()` 기반 RLS 정책을 적용할 대상 자체가 없다.
 *
 * 따라서 이슈가 요구하는 "최소 권한 원칙"은 RLS가 아니라 **애플리케이션 계층**에서
 * 강제하는 것이 이 아키텍처에 맞는 구현이다. 각 자동화 에이전트(크론/파이프라인/사령부
 * 모듈)는 자신의 역할에 허용된 테이블·연산으로만 제한된 클라이언트를 받아야 하며,
 * 권한 밖의 호출은 런타임에서 즉시 예외를 던진다. (설계 근거: docs/security/agent-access-control.md)
 */

/** 에이전트 역할 enum. 이슈의 분류를 이 저장소의 실제 스키마에 맞게 정렬했다. */
export const AGENT_ROLE = {
  /** 리포트/통계/알림 판단 — 전 테이블 읽기 전용, 쓰기·삭제 불가 */
  READ_ONLY: "AGENT_READ_ONLY",
  /** 예약/작업 기록 에이전트 — reservations·tasks 쓰기 (이슈의 AGENT_WRITE_VISIT) */
  RESERVATION_WRITER: "AGENT_RESERVATION_WRITER",
  /** 결제/보증서 기록 에이전트 — orders 쓰기, warranties는 불변 아카이브이므로 insert만 */
  PAYMENT_WRITER: "AGENT_PAYMENT_WRITER",
  /** 콘텐츠 마케팅 에이전트 — content_, blog, trend, intelligence 테이블 쓰기 */
  CONTENT_WRITER: "AGENT_CONTENT_WRITER",
  /** hq.dkansim.com 대장 전용 — 전체 CRUD (Service Role 그대로) */
  ADMIN: "AGENT_ADMIN",
} as const;

export type AgentRole = (typeof AGENT_ROLE)[keyof typeof AGENT_ROLE];

/** 테이블에 대해 허용되는 연산 */
export type TableOperation = "select" | "insert" | "update" | "upsert" | "delete";

export const ALL_OPERATIONS: readonly TableOperation[] = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
];

/**
 * 권한 그랜트. `tables`의 키는 테이블 이름 또는 접미사 `*` 와일드카드 프리픽스
 * (예: "content_*"). 값은 허용 연산 목록. `rpc`는 허용 RPC 함수 이름 목록(`"*"` = 전체).
 * `wildcard: true` 이면 명시되지 않은 테이블에도 `defaultOperations`를 적용한다.
 */
export type AgentGrant = {
  tables: Record<string, readonly TableOperation[]>;
  defaultOperations?: readonly TableOperation[];
  rpc: readonly string[] | "*";
};

const READ: readonly TableOperation[] = ["select"];
const READ_WRITE: readonly TableOperation[] = ["select", "insert", "update", "upsert"];

export const AGENT_GRANTS: Record<AgentRole, AgentGrant> = {
  [AGENT_ROLE.READ_ONLY]: {
    tables: {},
    // 명시되지 않은 모든 테이블에 대해 읽기 전용 허용
    defaultOperations: READ,
    rpc: [],
  },
  [AGENT_ROLE.RESERVATION_WRITER]: {
    tables: {
      reservations: READ_WRITE,
      tasks: READ_WRITE,
      apartments: READ,
      workers: READ,
    },
    defaultOperations: READ,
    rpc: [],
  },
  [AGENT_ROLE.PAYMENT_WRITER]: {
    tables: {
      orders: READ_WRITE,
      // warranties는 불변 아카이브(013) — 생성만 허용, 수정/삭제 불가
      warranties: ["select", "insert"],
      reservations: READ,
    },
    defaultOperations: READ,
    rpc: [],
  },
  [AGENT_ROLE.CONTENT_WRITER]: {
    tables: {
      "content_*": READ_WRITE,
      "market_intelligence*": READ_WRITE,
      "youtube_*": READ_WRITE,
      blog_posts: READ_WRITE,
      naver_trends: READ_WRITE,
      agent_logs: READ_WRITE,
      pipeline_logs: READ_WRITE,
      agent_memory: READ_WRITE,
      agent_chat_messages: READ_WRITE,
      knowledge_base: READ_WRITE,
      knowledge_base_external: READ_WRITE,
    },
    defaultOperations: READ,
    rpc: ["increment_blog_view"],
  },
  [AGENT_ROLE.ADMIN]: {
    tables: {},
    defaultOperations: ALL_OPERATIONS,
    rpc: "*",
  },
};

/** 테이블 이름이 그랜트 키(정확 일치 또는 `*` 와일드카드)와 매칭되는지 */
function matchesTableKey(table: string, key: string): boolean {
  if (key === table) return true;
  if (key.endsWith("*")) {
    return table.startsWith(key.slice(0, -1));
  }
  return false;
}

/** 주어진 역할이 특정 테이블에서 특정 연산을 수행할 수 있는지 */
export function isOperationAllowed(
  role: AgentRole,
  table: string,
  operation: TableOperation,
): boolean {
  const grant = AGENT_GRANTS[role];
  for (const [key, ops] of Object.entries(grant.tables)) {
    if (matchesTableKey(table, key)) {
      return ops.includes(operation);
    }
  }
  return (grant.defaultOperations ?? []).includes(operation);
}

/** 주어진 역할이 특정 RPC 함수를 호출할 수 있는지 */
export function isRpcAllowed(role: AgentRole, fn: string): boolean {
  const grant = AGENT_GRANTS[role];
  if (grant.rpc === "*") return true;
  return grant.rpc.includes(fn);
}

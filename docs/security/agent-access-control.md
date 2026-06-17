# 에이전트별 Supabase 접근 권한 설계 (Issue #23)

대경이엔피 플랫폼(dkansim.com)에서 다수의 서버 사이드 자동화 에이전트가 Supabase
데이터에 접근할 때, **역할별 최소 권한(Principle of Least Privilege)** 을 강제해
오작동·보안 사고로 인한 데이터 무결성 훼손을 예방하기 위한 설계 문서다.

## 1. 이 저장소의 실제 아키텍처와 이슈 제안의 간극

이슈 원안은 Supabase Auth의 JWT custom claims(`auth.jwt() ->> 'agent_role'`)와
RLS(`auth.uid()`) 기반 행 수준 보안을 제안한다. 그러나 이 저장소의 현재 구조는 다음과 같다.

| 항목 | 현재 상태 | 영향 |
|---|---|---|
| 인증 | **Supabase Auth 미사용.** admin/resident/worker 모두 자체 쿠키+HMAC 토큰(`admin-auth.ts`, `resident-db.ts`, `worker-auth.ts`) | `auth.uid()`/`auth.jwt()` 로 분기할 세션 주체가 DB에 없음 |
| 서버 DB 접근 | 전 구간 **Service Role Key** (`agent-db.ts`, `supabase-pg.ts`) | Service Role은 **RLS를 우회**한다 — 에이전트에 RLS를 걸어도 효과 없음 |
| 핵심 테이블 | `reservations`/`orders`/`warranties`/`workers`/`tasks`/`content_*`/`blog_posts` 등 | 이슈가 든 `visits`/`payments`/`customers` 테이블은 존재하지 않음 |
| anon 노출면 | 브라우저는 Realtime 구독용으로만 `reservations` SELECT(006 마이그레이션) | 사용자 데이터의 client 직접 쓰기 경로 없음 |

따라서 **JWT 클레임 + RLS 방식은 이 앱에 그대로 적용할 수 없다.** 전면 적용하려면
세 개의 자체 인증 시스템을 Supabase Auth로 마이그레이션해야 하며, 이는 이슈 범위를
한참 벗어나고 운영 중인 인증을 모두 깨뜨린다.

## 2. 채택한 방식 — 애플리케이션 계층 RBAC

보안 경계가 실제로 존재하는 **애플리케이션 계층**에서 최소 권한을 강제한다. 각
자동화 에이전트는 자신의 역할에 허용된 테이블·연산으로만 제한된 Supabase 클라이언트를
받고, 권한 밖의 호출(`insert`/`update`/`delete`/`rpc`)은 런타임에서 즉시
`AgentAccessError`로 차단된다.

- `src/lib/supabase/agents/roles.ts` — `AGENT_ROLE` enum, 역할→(테이블×연산) 권한 매트릭스, `isOperationAllowed`/`isRpcAllowed`
- `src/lib/supabase/agents/scoped-client.ts` — `createScopedAgentClient(role)` 및 역할별 팩토리(`readOnlyAgent`/`reservationWriterAgent`/`paymentWriterAgent`/`contentWriterAgent`/`adminAgent`). Service Role 클라이언트를 Proxy로 감싸 `.from(table)`·`.rpc(fn)` 호출을 가드한다. 우회 경로인 `.rest`·`.schema("public")`도 같은 정책을 적용하고, 다른 스키마 및 역할 스코프드 DB 클라이언트 범위 밖인 `auth`/`storage`/`functions`/`realtime` 서비스 표면은 ADMIN 외 역할에서 차단한다.
- `src/lib/supabase/agents/index.ts` — 배럴 익스포트

이 방식은 "읽기 전용 리포트 에이전트가 실수로 예약을 삭제" 같은, RLS로는 막을 수 없는
(Service Role이 우회하므로) 오작동을 코드 계층에서 확정적으로 차단한다.

## 3. 역할 정의 (AGENT_ROLE)

| 역할 | 상수 | 허용 범위 |
|---|---|---|
| 읽기 전용 | `AGENT_READ_ONLY` | 전 테이블 SELECT. 쓰기·삭제·RPC 불가. 리포트/통계/알림 판단(`hq-summary` 등) |
| 예약 기록 | `AGENT_RESERVATION_WRITER` | `reservations`·`tasks` 읽기+쓰기(insert/update/upsert), `apartments`·`workers` 읽기. 삭제 불가 |
| 결제 기록 | `AGENT_PAYMENT_WRITER` | `orders` 읽기+쓰기, `warranties` 는 불변 아카이브(013)이므로 **insert만**, `reservations` 읽기. 삭제 불가 |
| 콘텐츠 | `AGENT_CONTENT_WRITER` | `content_*`/`youtube_*`/`market_intelligence*`/`blog_posts`/`naver_trends`/`agent_*`/`knowledge_base*` 읽기+쓰기, `increment_blog_view` RPC. 삭제 불가 |
| 관리자 | `AGENT_ADMIN` | hq 대장 전용 전체 CRUD + 전체 RPC (Service Role 그대로, 가드 미적용) |

어떤 역할도 기본적으로 `delete` 를 갖지 않는다(ADMIN 제외). 명시되지 않은 테이블은
`defaultOperations`(읽기 전용 역할은 SELECT, 그 외도 SELECT)로만 접근 가능하다.

## 4. 사용 예

```ts
import { readOnlyAgent, reservationWriterAgent } from "@/lib/supabase/agents";

// 리포트 집계 — 읽기만 가능
const ro = readOnlyAgent();
await ro.from("agent_reports").select("*");      // OK
await ro.from("reservations").delete().eq(...);  // ❌ AgentAccessError

// 예약 에이전트 — 예약은 쓰기, 결제는 읽기만
const rw = reservationWriterAgent();
await rw.from("reservations").insert(row);       // OK
await rw.from("orders").insert(row);             // ❌ AgentAccessError
```

현재 `src/lib/hq-summary.ts` 의 현황 집계가 `readOnlyAgent()` 로 적용되어 있다.

## 5. 점진적 도입 가이드

기존 186개 호출처를 한 번에 교체하면 회귀 위험이 크므로 점진 적용한다.

1. 새로 작성하는 에이전트 모듈은 처음부터 역할 팩토리를 사용한다.
2. 기존 모듈은 다음 우선순위로 교체한다: 읽기 전용(`hq-summary`, 리포트/통계) →
   콘텐츠 파이프라인(`content-pipeline`/`market-intelligence`/`video-pipeline`) →
   예약/결제 경로.
3. `adminAgent()`/`requireAgentSupabase()`(Service Role 직접 사용)는 hq 대장 전용
   경로로만 한정한다.
4. 스토리지·Auth·Edge Functions·Realtime 권한이 필요한 자동화는 이 DB 스코프드
   클라이언트를 확장하지 말고, 별도 역할/정책을 설계한 뒤 명시적으로 도입한다.

## 6. RLS / Supabase Auth 로의 향후 확장(보류)

다음은 **현재 아키텍처에서 효과가 없거나(서비스 롤이 RLS 우회) 범위를 벗어나** 이번
구현에서 의도적으로 보류한 항목이다. 보안 연극(security theater)을 피하기 위해
무효한 RLS SQL을 추가하지 않았다.

- **JWT custom claims + `auth.jwt() ->> 'agent_role'` RLS** — Supabase Auth 도입이
  선행되어야 함(3개 자체 인증 시스템 마이그레이션). 별도 대규모 과제.
- **anon/authenticated 키로 직접 데이터 쓰기** — 현재 client 직접 쓰기 경로가 없어
  RLS 강화 실익이 낮음. anon은 Realtime 구독용 `reservations` SELECT만 사용.
- **pgTAP RLS 단위 테스트** — RLS를 실제 적용하는 단계에서 함께 도입.
- **FlutterFlow 앱 anon key 범위 검토 / hq AGENT_ADMIN IP·MFA 강화** — 코드 외
  인프라·운영 정책 영역으로, 이 저장소 변경으로 다룰 수 없음(별도 운영 문서 필요).

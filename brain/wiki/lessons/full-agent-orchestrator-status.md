---
name: full-agent-orchestrator-status
description: "Full 에이전트(총괄) tool-calling orchestrator — implemented 2026-06-21, all 7 test scenarios fully verified live by 2026-06-23 (incl. one maxTokens bug found+fixed in scenario 7)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 452de78e-235b-47c1-8dc0-3b3e7175e438
---

2026-06-21에 "Full 에이전트(오케스트레이터) 구축 작업"으로 `general`/"총괄" 채팅 에이전트(`src/lib/agent-chat.ts`)를 진짜 tool-calling 오케스트레이터로 확장. 구현 완료 + 커밋(`acb9385`) + `vercel --prod` 배포 완료.

**핵심 신규 파일**: `src/lib/full-agent.ts`(tool_use 멀티턴 루프), `src/lib/full-agent-tools.ts`(도구 6개), `src/lib/safe-query.ts`(화이트리스트 SELECT), `src/lib/system-health.ts`(주간 자가점검), `src/app/api/cron/weekly-system-check/route.ts`, `src/components/hq/system-health-card.tsx`. 계획 전문은 `C:\Users\user\.claude\plans\binary-exploring-hoare.md`.

**안전 설계(사용자 승인됨)**: GitHub 이슈는 `ai-improvement`가 아닌 `chat-suggestion` 라벨로 생성 — 자동구현/자동병합 워크플로우 미트리거. `supabase_query`는 원시 SQL이 아니라 화이트리스트 테이블 + 구조화된 쿼리만 허용.

**테스트 결과 (실제 API, 2026-06-21)**: 시나리오 1(종합현황)/2(콘텐츠 기획 등록)/3(대량발송 거부)/4(외부서비스 위임)/6(웹검색+지식베이스 저장) **전부 실제 Claude API 호출 + DB 직접 조회로 검증 완료**.

**시나리오 5/7도 2026-06-23 완전 검증 완료**:
- 시나리오 5(`github_read_file`): production `/api/admin/chat`(agentId=general)에 "field-report-opinion.ts의 maxTokens 값을 GitHub에서 직접 읽어 확인해줘"라고 요청 → 실제 현재 코드(99번째 줄, 값 `6000`)와 `agents.ts`의 `callClaudeCustom` 구현까지 정확히 인용한 답변 확인.
- 시나리오 7(주간 자가점검 cron): `POST /api/cron/weekly-system-check` 수동 트리거로 재검증. **2000→4000으로 고친 뒤에도 여전히 부족해서** findings가 많은 주(콘텐츠 파이프라인 장애 등 실제 데이터)에 응답이 또 잘려 `extractJsonBlock`이 빈 문자열 반환 → summary가 원문 300자 truncate로 fallback, findings/delegation_prompts가 빈 배열로 저장되는 버그를 추가로 발견. `src/lib/system-health.ts`에서 `8000`으로 재상향(커밋 `de76c96`) 후 재검증 → summary 한 줄 + findings 4건 + delegation_prompts 4건(배경/지시사항/테스트단계/"증거 없는 완료 불인정" 포맷 정확히 준수) 모두 정상 생성 확인.
- 프롬프트 캐싱(`cache_read>0`)과 라우팅 모델(`claude-haiku-4-5-20251001`)도 같은 production 호출의 Vercel 로그에서 동시에 확인됨 — 자세한 수치는 [[anthropic_quota_pending_verification]] 참고.

**How to apply**: 7개 시나리오 전부 실증 검증 완료. "maxTokens 부족 → 잘림 → JSON 파싱 실패/텍스트 truncate" 패턴이 이 코드베이스에서 반복 발생하는 버그 클래스임 — 새로운 Claude 호출을 추가하거나 maxTokens를 정할 때, "이 항목이 많아지면 응답이 길어질 수 있는가"를 먼저 따져보고 여유 있게 설정할 것 (필드리포트 소견 2400→6000, 주간점검 4000→8000 둘 다 같은 원인).

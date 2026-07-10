---
name: anthropic-quota-pending-verification
description: "Anthropic API usage limit hit 2026-06-21 — lifted early (before stated 2026-07-01 reset). ALL 5 blocked items fully re-verified 2026-06-23, 2 real bugs found+fixed."
metadata: 
  node_type: memory
  type: project
  originSessionId: 452de78e-235b-47c1-8dc0-3b3e7175e438
---

대장 계정의 Anthropic API 사용량 한도가 2026-06-21 세션 중 소진됨: `"You have reached your specified API usage limits. You will regain access on 2026-07-01 at 00:00 UTC."`. **2026-06-23, 명시된 리셋일(7/1)보다 일찍 풀림**. 같은 날 5건 전부 재검증 완료.

**재검증 결과 — 5/5 완료**:
1. ✅ [[full_agent_orchestrator_status]] 시나리오 5(`github_read_file`) — `hq.dkansim.com`(총괄/general)에게 `field-report-opinion.ts`의 `maxTokens` 값을 GitHub에서 직접 읽어 확인해달라고 요청 → 실제 현재 코드(99번째 줄, `6000`)와 `agents.ts`의 `callClaudeCustom` 구현까지 정확히 인용. 완전 검증됨.
2. ✅ PDF 자동 학습 기능 최종 답변 단계 — `knowledge_base`에 있던 테스트 PDF(`test-policy.pdf`, "분전반 점검 45일 특별보증/코드명 PROJECT GHIBLI-45" — 학습 데이터에 없는 합성 사실)에 대해 CLO에게 직접 질문 → 답변에 "45일"/"PROJECT GHIBLI-45" 정확히 인용됨. RAG 검색+답변 합성 end-to-end 완전 검증.
3. ✅ 프롬프트 캐싱 — Full 에이전트(총괄) 호출 Vercel 로그에서 `cache_read=17066`, `cache_read=13269` 등 명확히 `>0` 확인(한 턴 내 라운드 간 + 별도 요청 간 모두 재사용됨). 짧은 시스템 프롬프트(예: 현장점검 소견엔진의 659자)는 캐싱이 적용 안 되는 게 정상(1024 토큰 미만)이라는 점도 함께 확인.
4. ✅ Full 라우팅 모델 다운그레이드 — 같은 로그에서 `model=claude-haiku-4-5-20251001 input=613 output=9 cache_creation=0 cache_read=0`로 라우팅 분류 호출이 실제로 Haiku로 가는 것 확인, 에러 없음. (라우팅 정확도 10문항 비교는 미실시 — 필요시 추가.)
5. ✅ [[field_report_ai_opinion_engine]] — `POST /api/field-report/generate-opinion` 실제 성공, KEC 조항 인용 확인.

**부수적으로 발견+수정한 버그 2건(같은 클래스: maxTokens 부족 → JSON/텍스트 잘림)**:
- `src/lib/field-report-opinion.ts`: `maxTokens` 2400→6000 (커밋 `cc0cff3`)
- `src/lib/system-health.ts`(주간 자가점검 시나리오 7): `maxTokens` 4000→8000 (커밋 `de76c96`) — findings가 많은 주에 응답이 잘려 `extractJsonBlock`이 빈 문자열을 반환, summary가 원문 300자 truncate로 fallback되고 findings/delegation_prompts가 빈 배열로 저장되던 버그. 재검증 후 4개 findings + 4개 delegation_prompts 정상 생성 확인.

**팁**: curl로 한국어 JSON body를 보낼 때 `-d '{"message":"한글..."}'`처럼 인라인으로 넘기면 이 Windows/Git Bash 환경에서 인코딩이 깨질 수 있음(Claude가 "메시지 인코딩 깨짐"으로 응답) — UTF-8 파일로 써서 `--data-binary @file.json`으로 보내면 정상 동작.

**How to apply**: 이 메모는 이제 완전히 resolved — 더 이상 "재검증 대기"로 취급하지 말 것. 라우팅 정확도 10문항 비교만 선택적으로 남아있음.

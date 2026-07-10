---
name: field-report-ai-opinion-engine
description: "Field report KEC RAG + AI opinion generation engine — fully verified end-to-end in production 2026-06-23, including a maxTokens truncation bug fix"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f6317eb-e6b5-4bad-8756-04ebc58bed52
---

2단계(AI 세대 진단 소견 자동생성) 구축 완료(2026-06-22) + production 실제 호출로 완전 검증 완료(2026-06-23).

**구성**:
- `supabase/migrations/041_field_reports.sql` (1단계) + `042_field_report_opinions.sql` — `opinion_landlord`/`opinion_resident`/`opinion_generated_at` 컬럼, status에 `opinion_generated` 추가
- `knowledge_base` 테이블에 `category='regulation'` 7개 청크 시드 완료 (KEC 210/212/232/234, 전기안전관리법 시행규칙, 공동주택 화재원인TOP5, 차단기/콘센트 교체연한) — `scripts/seed-regulation-knowledge.mjs`로 실제 임베딩 생성 후 삽입, `supabase/seeds/regulation_knowledge.sql`은 동일 내용의 텍스트 문서(임베딩은 순수 SQL로 못 채워서 스크립트가 진짜 소스)
- `src/lib/field-report-opinion.ts` — `searchKnowledgeBase()` RAG + `callClaudeCustom()` (ephemeral 프롬프트 캐싱 자동 적용)으로 임대인용/거주자용 소견 생성, `===LANDLORD_OPINION===`/`===RESIDENT_OPINION===` 마커로 분리
- `POST /api/field-report/generate-opinion` — worker 인증, field_report 소유권 확인 후 생성·저장
- `/field-report/preview/[id]`에 "AI 소견 생성" 버튼 + 거주자용/임대인용 탭 UI 추가

**검증 상태**: RAG 검색은 실제 테스트 쿼리로 직접 확인 완료 (KEC 234/화재원인TOP5/교체연한/KEC 212가 정확히 상위 매칭, similarity 0.43~0.54). [[anthropic_quota_pending_verification]] 한도가 예상보다 일찍 풀려서(7/1 전, 2026-06-23) Claude 호출 단계까지 production에서 실제 검증 완료:
- `opinion_landlord`에 KEC 234/KEC 212 조항 번호 + 주택임대차보호법 제7조/민법 제623조까지 구체적으로 인용됨, `opinion_resident`는 쉬운 말 + 행동 3가지로 정상 생성
- `status='opinion_generated'`, `opinion_generated_at` DB 반영 확인

**발견+수정한 버그**: `maxTokens=2400`으로는 임대인용 소견이 표 포함 상세 버전으로 생성될 때 거주자용 소견이 문장 중간에 잘림(Vercel 로그에 `output=2400`으로 한도 정확히 소진된 것으로 확인). `6000`으로 상향(커밋 `cc0cff3`)해서 재검증 — 완결된 텍스트로 정상 생성됨.

**`cache_creation=0`/`cache_read=0`은 정상**: `SYSTEM_PROMPT`가 659자(~1024 토큰 미만)라 Anthropic이 캐싱 자체를 적용하지 않음(`agents.ts`의 기존 주석과 일치). 버그 아님 — 캐싱 효과를 보려면 시스템 프롬프트를 더 길게 만들어야 함(예: KB 컨텍스트를 시스템 블록에 포함).

**How to apply**: 추가 변경 없이 바로 사용 가능. 향후 system prompt를 수정할 때 maxTokens 여유를 충분히 두고(현재 6000), 응답이 또 잘리면 Vercel 로그의 `output=` 값이 maxTokens와 같은지부터 확인할 것.

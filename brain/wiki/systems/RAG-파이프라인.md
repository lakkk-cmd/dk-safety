---
title: "RAG 파이프라인"
category: systems
tags: ["rag", "knowledge"]
---

**단일 통합 테이블 `knowledge`에 듀얼 임베딩**을 저장한다(2026-07-11 통합, 이전엔
`knowledge_base`/`knowledge_chunks`로 완전히 분리된 두 벡터DB였음 — 안전 근거 없이 그냥
다른 시점에 만들어지며 굳어진 구조였고, web-learn 지식을 9-에이전트 채팅이 영원히 못 보는
기능 버그가 있어 통합함).

## 핵심 사실

| | `embedding_openrouter` | `embedding_voyage` |
|---|---|---|
| 임베딩 | OpenRouter, 1536차원 (`embedTexts`, `src/lib/embeddings.ts`) | Voyage AI voyage-3, 1024차원 (`embedChunks`, `src/lib/knowledge-embed.ts`) |
| 검색 RPC | `match_knowledge_base` (유사도 임계값 기본 0.4, 호출부는 0.35) | `match_chunks` |
| 검색 함수 | `searchKnowledgeBase` (`src/lib/knowledge-base.ts`) | `searchKnowledgeChunks`/`searchKnowledgeChunksWithEvidence` (`src/lib/knowledge-chunks-search.ts`) |
| 실제 소비자 | `agent-chat.ts`(9-에이전트 채팅), `field-report-opinion.ts`(현장 AI 소견) | `full-agent.ts`(풀 에이전트 — 안전 차단 게이트가 유사도 0.7 임계값에 의존) |

- 모든 생산자는 `src/lib/knowledge-store.ts::saveKnowledgeRows()` 하나로 쓴다 — 배치를 받아
  두 임베딩을 각각 독립적으로 계산해 한 행에 같이 저장한다. 한쪽 공급자가 실패해도(레이트리밋
  등) 성공한 쪽 임베딩은 저장된다.
- 생산자 목록: PDF 업로드(`knowledge-pdf-pipeline.ts`), 채팅 첨부 PDF(`pdf-knowledge.ts`),
  주간 뉴스 자동수집(`external-knowledge.ts`, `is_external:true`+90일 만료), 풀 에이전트
  "지식 저장" 도구(`full-agent-tools.ts`), 웹서치 자동학습(`web-learn.ts`), wiki 동기화
  (`scripts/brain-sync.ts`), 시드 스크립트(`scripts/seed-knowledge-base.ts`).
- 청크 분할은 전 생산자가 `chunkTextWithOverlap`(문장 겹침 방식, `knowledge-pdf-pipeline.ts`)
  하나로 통일 — 예전엔 PDF/wiki가 `knowledge_base`엔 overlap 청크(또는 wiki는 전체글 1행),
  `knowledge_chunks`엔 고정크기 500/50 청크로 이중·불일치 분할되던 문제를 없앴다.
- PDF는 8개 카테고리로 자동분류(`src/lib/knowledge-categories.ts`): 전기법령(regulation),
  전기기술(technical), 유튜브(content_youtube), 블로그(content_blog), 마케팅(marketing),
  AI자동화(ai_automation), 사업경영(business), 일반(general).
- 웹서치 학습(`web-learn.ts`)은 신뢰 도메인 화이트리스트 필터 + Gemini 전수검증을 거친 뒤
  `knowledge`에 적재된다(`is_external:true`로 표시되지만 만료일은 없음 — 외부 뉴스 자동수집
  `external-knowledge.ts`만 90일 만료가 붙는다).
- **검색 RPC 함수 이름·시그니처·반환값은 통합 전과 동일** — `match_knowledge_base`/
  `match_chunks`를 `CREATE OR REPLACE`로 새 테이블만 보게 바꿔서, 소비자 코드는 무수정.
  풀 에이전트의 안전 차단 게이트(유사도 0.7 임계값)도 임베딩 공급자·값이 그대로라 회귀 없음.
- 마이그레이션: `supabase/migrations/066_knowledge_unify.sql`(테이블 생성) →
  `scripts/migrate-knowledge-unify.ts`(옛 두 테이블 백필, 누락된 쪽 임베딩 새로 계산) →
  `067_knowledge_unify_cutover.sql`(RPC 전환). 옛 `knowledge_base`/`knowledge_chunks`
  테이블은 롤백 안전판으로 당분간 유지, 프로덕션 검증 후 별도로 삭제 예정.

관련: [[에이전트-시스템]] [[검증-체계]] [[현장보고서-파이프라인]]

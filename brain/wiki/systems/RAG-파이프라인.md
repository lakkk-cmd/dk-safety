---
title: "RAG 파이프라인"
category: systems
tags: ["rag", "knowledge"]
---

**독립된 지식베이스가 두 개 있다** — 서로 다른 임베딩 제공자, 서로 다른 소비자. 하나로 통합돼
있지 않다는 걸 반드시 알아야 한다.

## 핵심 사실

| | `knowledge_base` | `knowledge_chunks` |
|---|---|---|
| 임베딩 | OpenRouter (`embedText`, `src/lib/embeddings.ts`) | Voyage AI voyage-3, 1024차원 (`embedChunks`, `src/lib/knowledge-embed.ts`) |
| 채우는 곳 | PDF 업로드(`knowledge-pdf-pipeline.ts`), `scripts/seed-knowledge-base.ts`(회사 정체성/특허/트랙 시드) | 웹서치 자동학습(`src/lib/web-learn.ts`) |
| 검색 함수 | `searchKnowledgeBase` (`src/lib/knowledge-base.ts`) | `searchKnowledgeChunks`/`searchKnowledgeChunksWithEvidence` (`src/lib/knowledge-chunks-search.ts`, `match_chunks` RPC) |
| 실제 소비자 | `agent-chat.ts`(9-에이전트 채팅), `field-report-opinion.ts`(현장 AI 소견) | `full-agent.ts`(풀 에이전트) |

- PDF는 8개 카테고리로 자동분류(`src/lib/knowledge-categories.ts`): 전기법령(regulation),
  전기기술(technical), 유튜브(content_youtube), 블로그(content_blog), 마케팅(marketing),
  AI자동화(ai_automation), 사업경영(business), 일반(general).
- 웹서치 학습(`web-learn.ts`)은 신뢰 도메인 화이트리스트 필터 + Gemini 전수검증을 거친 뒤
  `knowledge_chunks`에 적재된다.
- `brain/wiki/`의 정적 지식(`scripts/brain-sync.ts`)은 **두 지식베이스 모두에** 동기화된다 —
  한쪽만 하면 9-에이전트 채팅과 풀 에이전트 중 하나는 새 지식을 영영 못 본다.

관련: [[에이전트-시스템]] [[검증-체계]] [[현장보고서-파이프라인]]

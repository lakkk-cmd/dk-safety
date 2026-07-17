---
title: "기능 현황 — feature"
category: features
tags: ["project-features", "feature"]
source: "project_features"
synced_at: "2026-07-17T20:40:55.839Z"
---

<!-- AUTO:START -->
## feature (14건)

- **6에이전트 시스템**: CTO/CSO/CMO/COO/CFO/CLO 자동 보고 — Claude API, GitHub Actions
- **AI 문서 생성**: 점검보고서/견적서/완료확인서 등을 Claude가 작성하고 Gemini가 검증 후 PDF+Word 생성 — Claude API, Gemini, pdf-lib, docx
  - 메모: 풀 에이전트 채팅의 generate_document 도구로만 호출됨 — 별도 REST API 없음
- **Gemini 코드리뷰**: 코드 변경 시 Gemini 자동 리뷰 — Gemini 2.5 Flash
- **PDF 자동학습**: PDF → 텍스트 → 청크 → 임베딩 → 검색 — pdf-parse, Voyage AI, pgvector
- **RAG 답변**: 질문 → 벡터검색 → Claude 답변 → Gemini 검증 — Voyage AI, Claude API, Gemini
- **거짓답변 방지**: RAG 근거 없으면 배지 표시, 거짓/위험정보 감지 시 답변 차단 — Gemini, pgvector
- **디지털 보증서**: 작업 완료 시 보증서 자동 발급 — pdf-lib, Solapi
- **신뢰도메인 화이트리스트**: 범주별 허용 도메인 DB 관리 — Supabase
- **웹서치 자동학습**: 키워드 검색 → 신뢰도메인 필터 → 전수검증 → 저장 — Tavily, Firecrawl, Gemini
- **채팅 Gemini 검토**: 풀 에이전트 답변 생성 후 Gemini 팩트체크 동기 실행 — Gemini 2.5 Flash
- **청크 전수검증**: 웹학습 시 모든 청크 Gemini 검증 — Gemini 2.5 Flash
- **코드 자동배포**: GitHub Actions → Vercel 자동 배포 — GitHub Actions, Vercel
- **콘텐츠 자동생성**: 블로그/카카오/유튜브 콘텐츠 AI 생성 — Claude API
- **풀 에이전트 저위험 자동구현**: 채팅에서 저위험 코드 변경은 에이전트가 스스로 판단해 자동구현 파이프라인(사람검토 없이 병합) 트리거 가능 — Claude Code Action, GitHub Actions

관련: [[index]]
<!-- AUTO:END -->

## 메모 (수동 편집 영역 — sync가 건드리지 않습니다)


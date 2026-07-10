---
title: "dk-brain — dk-safety 3층 지식 체계"
category: index
---

# dk-brain

Claude Code 세션, 6에이전트(경영진), 3개 콘텐츠 에이전트, 영상/블로그 팩토리 워커가 같은
지식을 공유하고, 모든 작업 결과가 다시 지식으로 축적되는 루프.

옵시디언에서 열기: `옵시디언 → 새 보관함 생성 → 기존 폴더에서 열기 → 이 저장소의 brain/ 폴더 선택`.

## 3층 구조

```
brain/
├── raw/        [1층] 원본. append-only, 수정·삭제 금지
│   ├── sessions/        Claude Code 세션 결정사항 로그
│   ├── consultations/   CRM 상담 원본 export
│   ├── field-reports/   현장 점검 기록 원본
│   ├── decisions/       대장의 확정 결정
│   ├── announcements/   정부지원 공고 원본
│   └── external/        회의록, 조사자료, 팩토리 워커 결과 요약
│
├── wiki/       [2층] AI 가공 지식. [[링크]]로 상호 연결. knowledge_base+knowledge_chunks에 임베딩됨
│   ├── systems/     시스템별 현행 문서 (아키텍처 사실)
│   ├── playbooks/   반복 업무 매뉴얼
│   ├── lessons/     실패·교훈 (Claude Code 세션 메모리 이관)
│   └── profile/     대경이엔피 사실 정보
│
└── ops/        [2층 특수 케이스] 고회전 운영 데이터 미러. 임베딩 대상 아님 — brain/ops/README.md 참고
```

3층(통제 규칙서)은 이 폴더가 아니라 저장소 루트의 `CLAUDE.md`에 있습니다 — "지식 체계 규칙" 섹션 참고.

## 층간 흐름

```
[1층 raw] ──(위키 갱신 규칙, CLAUDE.md)──► [2층 wiki] ──(scripts/brain-sync.ts)──► knowledge_base + knowledge_chunks
    ▲                                          │                                         │
    │                                          ▼                                         ▼
Claude Code 세션 /                        Claude Code가                        6에이전트 + 풀 에이전트 +
팩토리 워커(video/blog) /                  세션 시작 시 로드                     팩토리 워커가 RAG로
대장 결정                                 (프로젝트 컨텍스트 캐시)                동일 지식 사용
```

로컬(Claude Code)과 클라우드(에이전트)가 같은 뇌를 공유합니다.

## 동기화

```bash
npm run brain:sync       # brain/wiki/**/*.md → knowledge_base(OpenRouter) + knowledge_chunks(Voyage) 이중 임베딩
npm run brain:sync:ops   # Supabase(project_features/market_intelligence_insights/agent_memory) → brain/ops/*.md
```

`brain:sync`는 **정적 지식만** 대상으로 합니다(systems/playbooks/lessons/profile). `brain/ops/`는
고회전 데이터라 의도적으로 제외됩니다 — 이유는 `brain/ops/README.md` 참고.

## 경계

- `brain/raw/`는 append-only. 고객 개인정보(전화번호, 주소 상세)는 저장하지 않음 — CRM DB가 원본.
- API 키·시크릿은 어떤 층에도 저장 금지.
- 사실 우선순위: 코드 > raw > wiki. 위키와 코드가 충돌하면 코드가 맞고 위키를 고친다.

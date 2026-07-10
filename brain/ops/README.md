---
title: "brain/ops — 운영 데이터 미러"
category: index
---

# 이 폴더는 무엇인가

`project_features`, `market_intelligence_insights`, `agent_memory` — 매일/매주 갱신되는
고회전 운영 데이터를 사람이 읽고 고칠 수 있는 마크다운으로 미러링한 것입니다. `brain/` 전체를
옵시디언 볼트로 열면 이 폴더도 함께 그래프에 보입니다.

`brain/wiki/`(정적 지식: 아키텍처·플레이북·회사 프로필)와 다른 점: **이 폴더는
`knowledge_base`/`knowledge_chunks`에 임베딩되지 않습니다.** 매일 바뀌는 마켓 트렌드를 RAG
벡터DB에 계속 밀어넣으면 오래된 데이터가 쌓여 답변 품질을 오염시키기 때문에, 이 폴더는
**사람 전용 감사/편집 표면**으로만 씁니다. `scripts/brain-sync.ts`(정적 지식 임베딩, `brain/README.md`
참고)는 이 폴더를 건드리지 않습니다.

## 동기화

```bash
npm run brain:sync:ops
```

`scripts/sync-wiki-to-git.mjs`가 Supabase를 읽어 이 폴더 아래 마크다운을 갱신합니다. 각 파일은
`<!-- AUTO:START -->`~`<!-- AUTO:END -->` 구간만 매번 덮어쓰고, 그 아래 "## 메모" 구간은
옵시디언에서 직접 적어도 재동기화 시 보존됩니다.

## 폴더 구조

- `features/` — `project_features`, 카테고리별(page/api/feature/integration/pending) 1파일
- `market-intelligence/` — `market_intelligence_insights`, 카테고리별(전기안전/자격시험/실무) 1파일, 최근 12건
- `agent-memory/` — `agent_memory`, key별 1파일
- `index.md` — 전체 목차, 100% 자동 생성(직접 수정하지 마세요)

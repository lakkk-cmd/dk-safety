---
name: dk-blog-factory-status
description: "비용 0원 네이버 블로그 파이프라인 스펙 6단계 전부 완료 (2026-07-08) — 자동 발행 없음, 사람 발행이 승인 게이트"
metadata: 
  node_type: memory
  type: project
  originSessionId: ada164ad-3b49-4289-884e-37e8bdfdb2a9
---

dk-blog-factory (비용 0원 네이버 블로그 제작 파이프라인) — 2026-07-08 스펙 6단계 전부 구현+자율 e2e 검증 완료.

- 구조: blog_jobs(064) → 로컬 워커(video와 같은 pm2 프로세스, index.mjs 루프에 통합: video queued→video approved→blog queued 순) → 키워드 조사(worker/lib/naver-keywords.mjs — 네이버 검색광고 API, **키 미발급이라 현재 mock 모드**; searchad.naver.com에서 NAVER_AD_API_KEY/SECRET/CUSTOMER_ID 발급하면 자동 전환) → Claude 원고(worker/blog-writer-system-prompt.md, knowledge_chunks ILIKE RAG, 근거 없으면 주장 제외) → 검증 서브에이전트(80점 미만 1회 수정 재검증, 최종 점수 기록만 하고 차단 안 함) → sharp 사진 보정(적응밝기)+satori 썸네일 3종 → blog-assets 버킷 → pending_review → 카카오 알림(/api/blog-jobs/notify-review).
- **자동 발행 절대 금지**(네이버 API 2020 종료, 봇 발행 = 계정 제재 위험) — hq.dkansim.com/blog-jobs에서 대장이 단락 복사+사진 zip 받아 네이버 에디터에 수동 발행 후 URL 기록(published). 이게 승인 게이트.
- 에이전트 도구: create_blog_job/get_blog_job (풀에이전트, video와 동일 패턴). 자율 e2e: 채팅 등록→pm2 워커 자동 처리→알림까지 무개입 성공.
- 원고 프롬프트에 마크다운 금지 규칙 있음(네이버 에디터 일반 텍스트). 검증 74점짜리도 pending_review로 올라옴 — 점수는 UI 빨간 배지로 표시, 반려 판단은 대장 몫.

관련: [[dk-video-factory-status]], [[deploy-workflow]]

---
title: "기능 현황 — feature"
category: features
tags: ["project-features", "feature"]
source: "project_features"
synced_at: "2026-09-04T21:54:08.767Z"
---

<!-- AUTO:START -->
## feature (18건)

- **9-에이전트 디렉터 파이프라인**: 총괄디렉터(단독) → 자문단 CSO/COO/CFO/CLO(판단만, 산출물 없음) → 마케터 CMO/CTO(브리핑을 워커용 가이드라인으로 변환) → 워커 유튜브PD/카카오매니저/블로그에디터(제작 전담) 순차 위임 구조. 자문단 4명은 콘텐츠 발행(CLO)/경비·청구서(CFO)/작업자배정·콘텐츠작업등록(COO)/콘텐츠전략(CSO)/견적서·계약서(CLO+CFO) 5곳에서 검증 게이트 역할도 겸함(advisory-gates.ts). — Claude API, GitHub Actions
- **AI 문서 생성**: 점검보고서/견적서/완료확인서/안전안내문/계약서/제안서를 Claude가 작성. Gemini가 사실정확성/형식을 검증하고, 견적서·계약서·완료확인서·제안서(실제 금전·계약 문서)는 추가로 CLO(계약조건)+CFO(금액이 확정 요금 체계와 일치하는지) 검증을 통과해야 PDF+Word가 생성됨 — 반려되면 문서 자체가 만들어지지 않음. — Claude API, Gemini, pdf-lib, docx
  - 메모: 풀 에이전트 채팅의 generate_document 도구로만 호출됨 — 별도 REST API 없음
- **Gemini 코드리뷰**: 코드 변경 시 Gemini 자동 리뷰 — Gemini 2.5 Flash
- **hq 영업계획 현황판(9-11월)** (`/hq, /hq/sales-visit-log, /api/cron/sales-plan-weekly`): hq 홈 요약스트립에 '영업계획' 칩(이번달 신규 B2C 예약건수/목표10건, 클릭시 방문 관리사무소 수·무료배포 단지 수로 토글) 표시. /sales-visit-log 페이지에서 방문기록+영업비 등록. 매주 월요일 09:00 KST에 진도율을 카카오로 발송. 9-11월 한시 캠페인.
- **PDF 자동학습**: PDF → 텍스트 → 청크 → 임베딩 → 검색 — pdf-parse, Voyage AI, pgvector
- **RAG 답변**: 질문 → 벡터검색 → Claude 답변 → Gemini 검증 — Voyage AI, Claude API, Gemini
- **거짓답변 방지**: RAG 근거 없으면 배지 표시, 거짓/위험정보 감지 시 답변 차단 — Gemini, pgvector
- **디지털 보증서**: 작업 완료 시 보증서 자동 발급 — pdf-lib, Solapi
- **세대전기점검 앱 구독제** (`/apt-manager/subscribe`): inspect.dkansim.com 전기과장 앱의 PDF 다운로드 유료화 — 2026년 말까지는 초기 확산을 위해 구독 여부/쿼터와 무관하게 전면 무료(FREE_LAUNCH_PROMO_UNTIL=2027-01-01, apartment-subscriptions-pg.ts). 2027-01-01부터 원래 정책(30일 롤링 주기당 무료 5건, 점검건 단위, 재다운로드는 영구 무료, 초과 시 구독 필요)으로 복귀. 구독료는 단지 총세대수 기준 ≤300세대 30,000원/월, >300세대 50,000원/월. 세대 점검입력·AI 안전진단 판정·거주자 SMS/카카오 발송은 시기와 무관하게 항상 무료. — Next.js, Supabase, Toss Payments
  - 메모: 점검입력/AI판정/거주자 알림 발송과 거주민 공개 결과페이지(/unit-inspection/[id])는 게이트 대상이 아니며 항상 무료다.
- **신뢰도메인 화이트리스트**: 범주별 허용 도메인 DB 관리 — Supabase
- **영상 합성 파이프라인**: Claude 씬 기획 → 실제 사진 우선 매칭(없으면 OpenRouter Flux 씬 이미지 생성) → Supertone/ElevenLabs/edge-tts 나레이션 → ffmpeg Ken Burns+자막 조립으로 유튜브 영상 자동 생성. dk-video-factory 로컬 워커가 처리하고, 대장이 hq.dkansim.com/videos에서 승인해야만 유튜브(비공개)에 업로드됨. 실제 업로드 성공 사례 있음(2026-07-07 첫 업로드 이후 다수).
  - 메모: Veo API 비용($10-22/영상)으로 보류. Google Flow 수동 제작으로 대체 중
- **웹서치 자동학습**: 키워드 검색 → 신뢰도메인 필터 → 전수검증 → 저장 — Tavily, Firecrawl, Gemini
- **점검표 PDF 서명 URL 게이트**: 전기과장 다운로드용 PDF를 비공개 버킷 사본으로 이중 저장하고 서명 URL(5분)로만 내려준다. 공개 버킷의 거주민용 pdf_url은 그대로 유지 — Supabase Storage
- **채팅 Gemini 검토**: 풀 에이전트 답변 생성 후 Gemini 팩트체크 동기 실행 — Gemini 2.5 Flash
- **청크 전수검증**: 웹학습 시 모든 청크 Gemini 검증 — Gemini 2.5 Flash
- **코드 자동배포**: GitHub Actions → Vercel 자동 배포 — GitHub Actions, Vercel
- **콘텐츠 자동생성**: 블로그/카카오/유튜브 콘텐츠 AI 생성 — Claude API
- **풀 에이전트 저위험 자동구현**: 채팅에서 저위험 코드 변경은 총괄디렉터가 auto_implement=true를 제안할 수 있지만, 최종 결정권은 코드 규칙(tech-risk-rules.ts::classifyTechRisk)에 있다 — 가격/결제/인증/DB스키마/삭제/알림발송/외부API/공개발행 관련이면 에이전트 판단과 무관하게 강제로 사람 검토(false)로 전환된다. 통과한 것만 GitHub Actions가 자동 구현·병합(사람검토 없이)하며, 변경 파일이 1개 초과면 블라스트 레이디어스 게이트가 자동병합을 추가로 보류시킨다. — Claude Code Action, GitHub Actions

관련: [[index]]
<!-- AUTO:END -->

## 메모 (수동 편집 영역 — sync가 건드리지 않습니다)


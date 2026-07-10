---
title: "CRM·ERP"
category: systems
tags: ["crm", "erp"]
---

고객/상담/팔로업 관리(CRM)와 경비/세금계산서/작업자 정산(ERP)이 `/admin/crm/*`,
`/admin/erp/*`에 있고, 워크인(예약 없는 현장 즉시접수)과 보증서 발급이 그 사이를 잇는다.

## 핵심 사실

- CRM: `/admin/crm/customers`(고객), `/admin/crm/consultations`(상담+재상담 추적,
  Solapi 재상담 알림톡 `/api/crm/follow-up-send`).
- ERP: `/admin/erp/dashboard`(매출/경비/순이익), `/admin/erp/expenses`, `/admin/erp/invoices`
  (세금계산서/청구서 PDF), `/admin/erp/workers`(직원/외주 기사).
- 작업자 정산: `settle_worker_assignment()` Postgres 함수(migration 061)가 `worker_assignments`
  INSERT와 `expenses` INSERT를 원자적으로 묶음. `worker_assignments.reservation_id`+`worker_id`
  UNIQUE 제약으로 같은 작업 이중 정산을 막음.
- 워크인: `/admin/walk-in` — 예약 없이 현장에서 바로 접수.
- 보증서: 작업 완료 시 자동 발급, `warranties` 테이블(migration 013, 불변 아카이브),
  공개 검증 페이지 `/verify/[warranty_number]`.
- CRM+ERP 교차검증 시스템이 2026-07-02 구축·검증 완료됨(자세한 건 [[crm-erp-cross-validation-status]]
  참고) — `worker_assignments`가 한때 dead code였다가 위 정산 함수로 실제 연결됨.
- API 비용 자동 기록: `/api/cron/api-cost-track`(주간, 일요일)이 OpenRouter `credits` API로
  누적 사용액(USD)을 조회해 지난 실행 대비 증분만 `expenses`(category='API비용')에 남긴다
  (migration 065). Anthropic/Gemini/Voyage/Solapi는 API 키만으로 조회 가능한 사용량
  엔드포인트가 없어서 OpenRouter만 자동화됨 — 나머지는 여전히 수동 확인 필요.

관련: [[플랫폼-아키텍처]] [[현장보고서-파이프라인]] [[예약-배정-절차]] [[CS-재상담-절차]] [[ERP-작업자-정산-절차]]

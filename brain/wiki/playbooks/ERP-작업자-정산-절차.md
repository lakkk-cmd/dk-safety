---
title: "ERP 작업자 정산(마감) 절차"
category: playbooks
tags: ["playbook", "erp", "settlement"]
---

`/admin/erp/settlement`에서 완료된 작업 건별로 기사 수당을 확정한다.

## 절차

1. `GET /api/admin/erp/settlement` — `listPendingSettlements()`(정산 대기)와
   `listSettlementHistory()`(정산 이력)를 함께 조회해 보여줌.
2. 정산 확정: `POST /api/admin/erp/settlement`에 `reservationId`, `workerId`, `payAmount`
   (지급액, 0보다 커야 함) 전달 → `settleWorkerAssignment()`(`src/lib/erp-db.ts:311`)가
   `settle_worker_assignment` Postgres RPC 호출.
3. 이 RPC는 `worker_assignments` INSERT와 `expenses`(카테고리 '인건비') INSERT를
   **원자적으로** 함께 처리한다(migration 061) — 둘 중 하나만 반영되는 상황이 안 생김.
4. **중복 정산 자동 차단**: `worker_assignments(reservation_id, worker_id)` UNIQUE 제약 때문에
   같은 건을 두 번 정산하려 하면 DB가 거부한다 — 애플리케이션 코드가 아니라 스키마 레벨 안전장치.

## 확인할 것

- `payAmount`는 반드시 양수 — 0 이하면 API가 400으로 거부.
- 정산 = 지출(expenses) 기록이므로, `/admin/erp/dashboard`의 순이익 계산에 즉시 반영됨.

## 참고 — 아직 없는 것

이 코드베이스에는 **환불(refund/cancel) 처리 흐름이 없다**(Toss 관련 파일 전수 확인함,
"환불"/"cancel" 매칭 0건). 결제 취소가 필요하면 Toss 콘솔에서 수동 처리 후 `orders`/`expenses`
상태를 수기로 맞추는 수밖에 없다 — 자동화가 필요하면 별도 기능 개발 필요.

관련: [[CRM-ERP]]

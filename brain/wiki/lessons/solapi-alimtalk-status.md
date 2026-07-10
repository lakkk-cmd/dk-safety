---
name: solapi-alimtalk-status
description: Solapi 카카오 알림톡 연동 상태 — E2E 수신 확인 완료 일자 및 변수 매핑
metadata: 
  node_type: memory
  type: project
  originSessionId: cffe2cbd-1aa0-4e40-aeb5-4f86934e9870
---

Solapi 알림톡 E2E 완전 검증 완료 (2026-06-19).

**Why:** 템플릿 심사 대기로 `SOLAPI_TEMPLATE_ID`를 비워뒀다가, 승인 후 Vercel에 등록해 실제 발송 확인.

**동작 구조:**
- `customer-notification.ts` → `sendSolapiAlimtalk()` → Solapi SDK
- `SOLAPI_TEMPLATE_ID` 비어있으면 graceful skip (console.log만)
- `SOLAPI_TEMPLATE_ID` 채워지면 실제 발송 모드 자동 전환
- SDK가 변수 키 자동 변환: `고객명` → `#{고객명}` (`formatVariableKey` 함수)

**템플릿 변수 매핑:**
- `고객명` → reservation.name
- `점검일시` → `${preferredDate} ${preferredTime}`
- `결과링크` → `https://dkansim.com/verify/${reservationId}`
- `리뷰링크` → `NAVER_REVIEW_URL` env var (미설정 시 `https://dkansim.com`)

**발송 트리거:** `PATCH /api/worker/tasks/[id]` → `action: "complete"` 시 자동 발송

**테스트 엔드포인트:** `POST /api/admin/test-alimtalk` (관리자 전용, 임시 유지)

**수신 확인:** 010-8945-1111 (대장 번호) 2026-06-19 실제 카카오톡 알림톡 수신 완료.

**How to apply:** 고객 완료 처리 후 알림 문제 생기면 `notifyCustomerWorkCompleted` → `sendSolapiAlimtalk` 경로 확인. 변수 누락 시 SDK `VariableValidationError` 발생.
